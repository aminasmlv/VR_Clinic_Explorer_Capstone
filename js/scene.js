
"use strict";

const stages = [
  { name: "Welcome", description: "Welcome! Look at CHECK IN, then discover what happens at the doctor's office.", entity: "welcomeState" },
  { name: "Examination", description: "Look at the stethoscope, thermometer and examination bed to learn about them.", entity: "examinationState" },
  { name: "Preparation and Finish", description: "Answer three short questions about your visit.", entity: "finishState" }
];

const explanations = {
  stethoscope: "A stethoscope helps the doctor listen to your heartbeat and breathing.",
  thermometer: "A thermometer measures your body temperature.",
  bed: "The examination bed is a comfortable place to sit or lie down during a check-up."
};

const quiz = [
  {
    question: "Which tool helps the doctor listen to your heartbeat?",
    answers: ["STETHOSCOPE", "THERMOMETER", "EXAM BED"],
    correct: 0
  },
  {
    question: "Which tool measures your temperature?",
    answers: ["EXAM BED", "THERMOMETER", "STETHOSCOPE"],
    correct: 1
  },
  {
    question: "What can you do if you need a pause?",
    answers: ["SAY NOTHING", "RUN AWAY", "ASK THE DOCTOR"],
    correct: 2
  }
];

let currentStage = 0;
let checkedIn = false;
let explored = new Set();
let quizIndex = 0;
let quizScore = 0;
let finished = false;

const byId = id => document.getElementById(id);

const value = (id, text) => {
  const el = byId(id);
  if (el) el.setAttribute("value", text);
};

const visible = (id, state) => {
  const el = byId(id);
  if (el) el.setAttribute("visible", state);
};

const status = text => {
  const el = byId("taskStatus");
  if (el) el.textContent = text;
};

function renderQuiz() {
  const item = quiz[quizIndex];
  if (!item || finished) return;

  value("quizQuestion", item.question);
  value("quizProgress", `QUESTION ${quizIndex + 1} OF ${quiz.length}`);

  item.answers.forEach((answer, i) => {
    value(`quizAnswer${i}`, answer);
  });

  value("quizFeedback", "Choose the correct answer.");
  visible("quizChoices", true);
  visible("restartVR", false);
  visible("restartLabel", false);
}

function answerQuiz(number) {
  if (currentStage !== 2 || finished) return;

  const item = quiz[quizIndex];

  if (number !== item.correct) {
    value("quizFeedback", "Not quite. Try another answer!");
    status("Try again. You can take your time.");
    return;
  }

  quizScore += 1;
  quizIndex += 1;

  if (quizIndex === quiz.length) {
    finished = true;

    value("quizQuestion", "WELL DONE! YOU FINISHED THE TOUR!");
    value("quizProgress", `${quizScore} / ${quiz.length} CORRECT`);
    value("quizFeedback", "You can ask your doctor questions and take a pause.");

    visible("quizChoices", false);
    visible("restartVR", true);
    visible("restartLabel", true);

    status("Great job! You completed the clinic tour.");
  } else {
    renderQuiz();
    status(`Correct! You have answered ${quizScore} of ${quiz.length} questions.`);
  }
}

function showStage(index) {
  if (index < 0 || index >= stages.length) return;

  currentStage = index;
  document.getElementById("guideModel")
  .setAttribute("visible", currentStage === 0);

  stages.forEach((stage, i) => {
    visible(stage.entity, i === currentStage);
  });

  byId("stageTitle").textContent = stages[currentStage].name;
  byId("description").textContent = stages[currentStage].description;
  byId("stepCount").textContent = `${currentStage + 1} / 3`;

  byId("backButton").disabled = currentStage === 0;
  byId("nextButton").disabled = currentStage === stages.length - 1;

  visible("backVR", currentStage > 0);
  visible("backVRLabel", currentStage > 0);
  visible("nextVR", currentStage < stages.length - 1);
  visible("nextVRLabel", currentStage < stages.length - 1);

  if (currentStage === 0) {
    status(checkedIn
      ? "Checked in! You can explore the clinic."
      : "Look at CHECK IN on the reception desk.");
  }

  if (currentStage === 1) {
    status(`Tools explored: ${explored.size} / 3. Look at each tool.`);
  }

  if (currentStage === 2) {
    status(finished
      ? "Tour complete. Great job!"
      : `Answer question ${quizIndex + 1} of 3.`);
  }
}

function nextStage() {
  showStage(currentStage + 1);
}

function previousStage() {
  showStage(currentStage - 1);
}

function restartTour() {
  checkedIn = false;
  explored = new Set();
  quizIndex = 0;
  quizScore = 0;
  finished = false;

  value("toolProgress", "TOOLS EXPLORED: 0 / 3");
  value("objectInfo", "Look at a tool for 1.5 seconds to explore it.");

  renderQuiz();
  showStage(0);
}

document.addEventListener("DOMContentLoaded", () => {
  byId("backButton").addEventListener("click", previousStage);
  byId("nextButton").addEventListener("click", nextStage);

  document.querySelectorAll("[data-action]").forEach(element => {
    element.addEventListener("click", () => {
      const action = element.dataset.action;

      if (action === "next") nextStage();
      if (action === "back") previousStage();

      if (action === "checkin" && currentStage === 0) {
        checkedIn = true;
        status("Checked in! You are ready to explore.");
      }

      if (action === "restart") restartTour();

      if (action === "speak" &&
          typeof window.startVoiceQuestion === "function") {
        window.startVoiceQuestion();
      }
    });
  });

  document.querySelectorAll("[data-topic]").forEach(element => {
    element.addEventListener("click", () => {
      if (currentStage !== 1) return;

      const topic = element.dataset.topic;
      const message = explanations[topic];
      if (!message) return;

      explored.add(topic);

      value("objectInfo", message);
      value("toolProgress", `TOOLS EXPLORED: ${explored.size} / 3`);
      value("vrResponse", message);
      byId("aiResponse").textContent = message;

      status(explored.size === 3
        ? "All three tools explored! Continue when ready."
        : `Tools explored: ${explored.size} / 3.`);
    });
  });

  document.querySelectorAll("[data-answer]").forEach(element => {
    element.addEventListener("click", () => {
      answerQuiz(Number(element.dataset.answer));
    });
  });

  document.querySelectorAll("[data-manual]").forEach(element => {
    element.addEventListener("click", () => {
      if (window.ClinicGuide) {
        window.ClinicGuide.chooseTopic(element.dataset.manual);
      }
    });
  });

  renderQuiz();
  showStage(0);
});
