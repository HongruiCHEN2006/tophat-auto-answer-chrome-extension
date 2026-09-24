(function (root) {
  "use strict";
  const SELECTORS = Object.freeze({
    questionContainers: [
      "[data-thaa-question]", "[data-testid='question-container']", "[data-question-id]",
      ".question-container", ".poll-container", "[class*='QuestionContainer']"
    ],
    promptCandidates: [
      "[data-thaa-prompt]", "[data-testid='question-prompt']", ".question-prompt",
      "[class*='QuestionPrompt']", "h1", "h2", "h3", "legend"
    ],
    radioOptions: ["input[type='radio']"],
    checkboxOptions: ["input[type='checkbox']"],
    optionLabels: ["label", "[role='radio']", "[role='checkbox']", "[data-option-id]"],
    textInputs: ["textarea[data-answer-type='text']", "textarea", "input[type='text']:not([data-answer-type='formula'])"],
    numericInputs: ["input[data-answer-type='numeric']", "input[type='number']", "input[inputmode='decimal']"],
    formulaInputs: ["input[data-answer-type='formula']", "[data-formula-input] input", ".formula-input input"],
    sortingContainers: ["[data-thaa-sorting]", "[data-testid='sorting-container']", "[role='list'][aria-label*='sort' i]", ".sortable-list"],
    sortingItems: ["[data-sort-id]", "[data-item-id]", "[role='listitem']"],
    matchingContainers: ["[data-thaa-matching]", "[data-testid='matching-container']", ".matching-container"],
    matchingLeftItems: ["[data-match-left-id]", "[data-left-id]", ".matching-left [data-item-id]"],
    matchingRightItems: ["[data-match-right-id]", "[data-right-id]", ".matching-right [data-item-id]"],
    matchingSelects: ["select[data-match-for]", "[data-thaa-matching] select"],
    timerCandidates: ["[data-thaa-timer]", "[data-testid*='timer']", "[aria-label*='remaining' i]", ".countdown", "[class*='Timer']"],
    loginIndicators: ["form[action*='login' i]", "input[type='password']", "[data-testid*='login' i]", "[data-testid*='sign-in' i]", ".login-page"],
    graphicalIndicators: ["canvas", "[data-question-type='click-target']", "[class*='geogebra' i]", "[data-testid*='graph' i]"],
    submitButtons: ["[data-thaa-submit]", "button[type='submit']", "[data-testid='submit-answer']", ".submit-button", ".answer-submit"]
  });
  root.THAA = root.THAA || {};
  root.THAA.SELECTORS = SELECTORS;
})(globalThis);
