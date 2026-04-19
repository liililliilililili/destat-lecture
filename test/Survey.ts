import { expect } from "chai";
import { network } from "hardhat";

interface Question {
  question: string;
  options: string[];
}

describe("Survey init", function () {
  this.timeout(120000); // 타임아웃 방지

  const title = "막무가내 설문조사라면";
  const description =
    "중앙화된 설문조사로서, 모든 데이터는 공개되지 않으며 설문조사를 게시한자만 볼 수 있습니다.";
  const questions: Question[] = [
    {
      question: "누가 내 응답을 관리할때 더 솔직할 수 있을까요?",
      options: [
        "구글폼 운영자",
        "탈중앙화된 블록체인 (관리주체 없으며 모든 데이터 공개)",
        "상관없음",
      ],
    },
  ];

  // 과제에서 제공된 컨트랙트 배포 헬퍼 함수
  const getSurveyContractAndEthers = async (survey: {
    title: string;
    description: string;
    targetNumber: number;
    questions: Question[];
  }) => {
    const { ethers } = await network.connect();
    
    // 보상 풀(Reward Pool) 설정을 위해 배포 시 value 전송
    const cSurvey = await ethers.deployContract(
      "Survey",
      [
        survey.title,
        survey.description,
        survey.targetNumber,
        survey.questions,
      ],
      { value: ethers.parseEther("10") }
    );
    return { ethers, cSurvey };
  };

  describe("Deployment", () => {
    it("should store survey info correctly", async () => {
      const { cSurvey } = await getSurveyContractAndEthers({
        title, description, targetNumber: 10, questions
      });
      expect(await cSurvey.title()).to.equal(title);
      expect(await cSurvey.description()).to.equal(description);
      expect(await cSurvey.targetNumber()).to.equal(10n);
    });

    it("should calculate rewardAmount correctly", async () => {
      const { ethers, cSurvey } = await getSurveyContractAndEthers({
        title, description, targetNumber: 10, questions
      });
      const expectedReward = ethers.parseEther("1");
      expect(await cSurvey.rewardAmount()).to.equal(expectedReward);
    });
  });

  describe("Questions and Answers", () => {
    it("should return questions correctly", async () => {
      const { cSurvey } = await getSurveyContractAndEthers({
        title, description, targetNumber: 10, questions
      });
      const q = await cSurvey.getQuestions();
      expect(q.length).to.equal(1);
      // 에러 수정:  인덱스 추가
      expect(q[0].question).to.equal(questions[0].question);
    });

    it("should allow valid answer submission", async () => {
      const { ethers, cSurvey } = await getSurveyContractAndEthers({
        title, description, targetNumber: 10, questions
      });
      const [, respondent] = await ethers.getSigners(); 

      // 1. 제출할 응답 배열은 변수 선언 없이 직접 할당하거나, 다른 이름으로 전달합니다.
      await cSurvey.connect(respondent).submitAnswer({
        respondent: respondent.address,
        answers: [1], 
      });

      // 2. [수정] 컨트랙트에서 받아오는 변수명을 answers가 아닌 submittedAnswers로 변경합니다.
      const submittedAnswers = await cSurvey.getAnswers();
      expect(submittedAnswers.length).to.equal(1);
      
      // 3. [수정] 위에서 변경한 변수명(submittedAnswers)에 인덱스 을 붙여 검증합니다.
      expect(submittedAnswers[0].respondent).to.equal(respondent.address);  
    }); 

    it("should revert if answer length mismatch", async () => {
      const { ethers, cSurvey } = await getSurveyContractAndEthers({
        title, description, targetNumber: 10, questions
      });
      const [, respondent] = await ethers.getSigners();

      await expect(
        cSurvey.connect(respondent).submitAnswer({
          respondent: respondent.address,
          answers: [6, 7], // 길이를 불일치시켜 Revert 유도
        })
      ).to.be.revertedWith("Mismatched answers length");
    });

    it("should revert if target reached", async () => {
      const { ethers, cSurvey } = await getSurveyContractAndEthers({
        title, description, targetNumber: 1, questions
      });
      const [, respondent1, respondent2] = await ethers.getSigners();

      await cSurvey.connect(respondent1).submitAnswer({
        respondent: respondent1.address,
        answers: [6],
      });

      await expect(
        cSurvey.connect(respondent2).submitAnswer({
          respondent: respondent2.address,
          answers: [7],
        })
      ).to.be.revertedWith("This survey has been ended");
    });
  });

  describe("Rewards", () => {
    it("should pay correct reward to respondent", async () => {
      const { ethers, cSurvey } = await getSurveyContractAndEthers({
        title, description, targetNumber: 10, questions
      });
      const [, respondent] = await ethers.getSigners();

      const initialBalance = await ethers.provider.getBalance(respondent.address);

      const tx = await cSurvey.connect(respondent).submitAnswer({
        respondent: respondent.address,
        answers: [6],
      });
      const receipt = await tx.wait();
      
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;
      const finalBalance = await ethers.provider.getBalance(respondent.address);
      const rewardAmount = await cSurvey.rewardAmount();

      expect(finalBalance).to.equal(initialBalance + rewardAmount - gasUsed);
    });
  });
});