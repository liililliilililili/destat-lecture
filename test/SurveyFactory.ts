import { expect } from "chai";
import { network } from "hardhat";

interface Question {
  question: string;
  options: string[];
}

const sampleQuestions: Question[] = [
  {
    question: "누가 내 응답을 관리할때 더 솔직할 수 있을까요?",
    options: [
      "구글폼 운영자",
      "탈중앙화된 블록체인 (관리주체 없으며 모든 데이터 공개)",
      "상관없음",
    ],
  },
];

const MIN_POOL = "50";
const MIN_REWARD = "0.1";

describe("SurveyFactory Contract", () => {
  let factory: any;
  let ethers: any;
  let owner: any;
  let respondent1: any;
  let respondent2: any;

  beforeEach(async () => {
    ({ ethers } = await network.connect());
    [owner, respondent1, respondent2] = await ethers.getSigners();

    factory = await ethers.deployContract("SurveyFactory", [
      ethers.parseEther(MIN_POOL),
      ethers.parseEther(MIN_REWARD),
    ]);
  });

  it("should deploy with correct minimum amounts", async () => {
    await expect(
      factory.createSurvey(
        {
          title: "테스트",
          description: "설명",
          targetNumber: 10,
          questions: sampleQuestions,
        },
        { value: ethers.parseEther("49") }
      )
    ).to.be.revertedWith("Insufficient pool amount");
  });

  it("should create a new survey when valid values are provided", async () => {
    const title = "막무가내 설문조사";
    const description =
      "중앙화된 설문조사로서, 모든 데이터는 공개되지 않으며 설문조사를 게시한자만 볼 수 있습니다.";
    const targetNumber = 100;
    const poolAmount = ethers.parseEther("100");

    const tx = await factory.createSurvey(
      { title, description, targetNumber, questions: sampleQuestions },
      { value: poolAmount }
    );
    const receipt = await tx.wait();

    let surveyAddress: string | undefined;
    receipt?.logs.forEach((log: any) => {
      const event = factory.interface.parseLog(log);
      if (event?.name === "SurveyCreated") {
        surveyAddress = event.args[0];
      }
    });

    expect(surveyAddress).to.be.properAddress;

    const surveys = await factory.getSurveys();
    expect(surveys.length).to.equal(1);
    expect(surveys[0]).to.equal(surveyAddress);
  });

  it("should revert if pool amount is insufficient", async () => {
    await expect(
      factory.createSurvey(
        {
          title: "부족한 풀",
          description: "풀 금액이 부족합니다",
          targetNumber: 10,
          questions: sampleQuestions,
        },
        { value: ethers.parseEther("10") }
      )
    ).to.be.revertedWith("Insufficient pool amount");
  });

  it("should revert if reward per respondent is insufficient", async () => {
    await expect(
      factory.createSurvey(
        {
          title: "보상 부족 설문",
          description: "1인당 보상이 최소 보상보다 낮습니다",
          targetNumber: 10000,
          questions: sampleQuestions,
        },
        { value: ethers.parseEther("50") }
      )
    ).to.be.revertedWith("Insufficient reward amount");
  });

  it("should track multiple surveys", async () => {
    await factory.createSurvey(
      {
        title: "첫 번째 설문",
        description: "첫 번째",
        targetNumber: 10,
        questions: sampleQuestions,
      },
      { value: ethers.parseEther("50") }
    );

    await factory.createSurvey(
      {
        title: "두 번째 설문",
        description: "두 번째",
        targetNumber: 10,
        questions: sampleQuestions,
      },
      { value: ethers.parseEther("50") }
    );

    const surveys = await factory.getSurveys();
    expect(surveys.length).to.equal(2);
  });

  it("should pay reward to respondent after submitting answer", async () => {
    const targetNumber = 10;
    const poolAmount = ethers.parseEther("100");

    const tx = await factory.createSurvey(
      {
        title: "보상 설문",
        description: "응답 후 보상 지급 테스트",
        targetNumber,
        questions: sampleQuestions,
      },
      { value: poolAmount }
    );
    await tx.wait();

    const surveys = await factory.getSurveys();
    const surveyAddress = surveys[0];
    expect(surveyAddress).to.be.properAddress;

    const signers = await ethers.getSigners();
    const resp = signers[3];

    const survey = await ethers.getContractAt("Survey", surveyAddress, resp);

    const balanceBefore = await ethers.provider.getBalance(resp.address);

    const submitTx = await survey.submitAnswer({
      respondent: resp.address,
      answers: [1],
    });
    await submitTx.wait();

    const balanceAfter = await ethers.provider.getBalance(resp.address);

    // 1인당 보상 = 100 ETH / 10 = 10 ETH >> 가스비이므로 잔액이 증가해야 함
    expect(balanceAfter).to.be.gt(balanceBefore);
  });

  it("should revert when survey is already ended", async () => {
    const tx = await factory.createSurvey(
      {
        title: "단기 설문",
        description: "한 명만 응답 가능",
        targetNumber: 1,
        questions: sampleQuestions,
      },
      { value: ethers.parseEther("50") }
    );
    const receipt = await tx.wait();

    let surveyAddress: string | undefined;
    receipt?.logs.forEach((log: any) => {
      const event = factory.interface.parseLog(log);
      if (event?.name === "SurveyCreated") {
        surveyAddress = event.args[0];
      }
    });

    const survey = await ethers.getContractAt("Survey", surveyAddress!);

    await survey.connect(respondent1).submitAnswer({
      respondent: respondent1.address,
      answers: [0],
    });

    await expect(
      survey.connect(respondent2).submitAnswer({
        respondent: respondent2.address,
        answers: [1],
      })
    ).to.be.revertedWith("This survey has been ended");
  });
});