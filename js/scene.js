
const stages = [
  {
    name: "Welcome",
    description: "Welcome to our clinic! Take your time and discover what happens during a regular doctor's visit.",
    entity: "welcomeState"
  },
  {
    name: "Examination",
    description: "Explore the examination room. Look at the medical tools to learn what they do.",
    entity: "examinationState"
  },
  {
    name: "Preparation and Finish",
    description: "You have explored the clinic! Now you know more about a regular check-up.",
    entity: "finishState"
  }
];

let currentStage = 0;

function showStage(index) {
  if (index < 0 || index >= stages.length) return;

  currentStage = index;

  stages.forEach((stage, i) => {
    document.getElementById(stage.entity)
      .setAttribute("visible", i === currentStage);
  });

  document.getElementById("stageTitle").textContent =
    stages[currentStage].name;

  document.getElementById("description").textContent =
    stages[currentStage].description;

  document.getElementById("backButton").disabled =
    currentStage === 0;

  document.getElementById("nextButton").disabled =
    currentStage === stages.length - 1;

  const backVR = document.getElementById("backVR");
  const nextVR = document.getElementById("nextVR");

  backVR.setAttribute("visible", currentStage > 0);
  nextVR.setAttribute("visible", currentStage < stages.length - 1);

  document.getElementById("backVRLabel")
    .setAttribute("visible", currentStage > 0);

  document.getElementById("nextVRLabel")
    .setAttribute("visible", currentStage < stages.length - 1);
}

function nextStage() {
  showStage(currentStage + 1);
}

function previousStage() {
  showStage(currentStage - 1);
}

const explanations = {
  stethoscope: "A stethoscope helps the doctor listen to your heartbeat and breathing.",
  thermometer: "A thermometer measures your body temperature.",
  bed: "The examination bed gives you a comfortable place to sit or lie down during a check-up."
};

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("nextButton")
    .addEventListener("click", nextStage);

  document.getElementById("backButton")
    .addEventListener("click", previousStage);

  document.querySelectorAll("[data-action]").forEach(element => {
    element.addEventListener("click", () => {
      const action = element.dataset.action;

      if (action === "next") nextStage();
      if (action === "back") previousStage();

      if (action === "speak" &&
          typeof window.startVoiceQuestion === "function") {
        window.startVoiceQuestion();
      }
    });
  });

  document.querySelectorAll("[data-topic]").forEach(element => {
    element.addEventListener("click", () => {
      const topic = element.dataset.topic;
      const message = explanations[topic];

      if (!message) return;

      document.getElementById("objectInfo")
        .setAttribute("value", message);

      document.getElementById("vrResponse")
        .setAttribute("value", message);

      document.getElementById("aiResponse").textContent = message;
    });
  });

  showStage(0);
});
