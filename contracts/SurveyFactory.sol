// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./Survey.sol";

struct SurveySchema {
  string title;
  string description;
  uint256 targetNumber;
  Question[] questions;
}

event SurveyCreated(address);

contract SurveyFactory { 
    uint256 public min_pool_amount;   // public 추가됨
    uint256 public min_reward_amount; // public 추가됨
    Survey[] surveys;

    constructor(uint256 _min_pool_amount, uint256 _min_reward_amount) { 
        min_pool_amount = _min_pool_amount; 
        min_reward_amount = _min_reward_amount; 
    }

  function createSurvey(SurveySchema calldata _survey) external payable {
    require(msg.value >= min_pool_amount, "Insufficient pool amount");
    require(
      msg.value / _survey.targetNumber >= min_reward_amount,
      "Insufficient reward amount"
    );


    Survey survey = new Survey{value: msg.value}(
      _survey.title,
      _survey.description,
      _survey.targetNumber,
      _survey.questions
      );
      surveys.push(survey);
      emit SurveyCreated(address(survey));
  }

  function getSurveys() external view returns (Survey[] memory) {
    return surveys;
  }
}