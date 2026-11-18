
"use strict";

// VR Clinic Explorer
// AI module owner: Islamiya Okassova, 242322
//
// Stage 1: semantic question matching and text interaction.
// Voice recognition uses Web Speech API when supported.
//
// Reference:
// https://huggingface.co/docs/transformers.js/v2.17.2/en/api/pipelines
// Model:
// https://huggingface.co/Xenova/all-MiniLM-L6-v2
//
// The model creates sentence embeddings.
// Prepared answers are selected using semantic similarity.
// We do not train or fine-tune the pretrained model here.

(() => {
  const LIBRARY_URL =
    "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2";

  const MODEL_ID = "Xenova/all-MiniLM-L6-v2";
  const MODEL_REVISION = "main";

  // Initial development settings, not validated accuracy claims.
  // Tune using development questions, then evaluate on separate questions.
  const MIN_SIMILARITY = 0.45;
  const MIN_MARGIN = 0.06;
  const MAX_QUESTION_LENGTH = 250;
  const WAIT_LIMIT_MS = 90000;

  const TOPICS = {
    stethoscope: {
      label: "Stethoscope",
      answer:
        "A stethoscope helps the doctor listen to your heartbeat " +
        "and breathing. You can ask the doctor to show it to you first.",
      examples: [
        "What is a stethoscope?",
        "Why does the doctor listen to my heart?",
        "How does the doctor hear my breathing?",
        "What is the tool the doctor puts on my chest?"
      ]
    },

    thermometer: {
      label: "Thermometer",
      answer:
        "A thermometer measures your body temperature. " +
        "The doctor can explain how they will use it before they begin.",
      examples: [
        "What is a thermometer?",
        "How does the doctor check my temperature?",
        "What tool measures how hot my body is?",
        "Why do they measure my temperature?"
      ]
    },

    checkup: {
      label: "Regular check-up",
      answer:
        "At a regular check-up, the doctor may ask how you feel, " +
        "listen to your heartbeat, and check your temperature. " +
        "You can ask questions or ask for a pause.",
      examples: [
        "What happens during a regular check-up?",
        "What will the doctor do during my visit?",
        "Can someone explain the examination before it starts?",
        "Can I ask the doctor to pause during my check-up?"
      ]
    }
  };

  const UNKNOWN_ANSWER =
    "I am not sure which part of our tour you mean. " +
    "Please ask about a stethoscope, a thermometer, or a regular check-up. " +
    "For personal health questions, ask your doctor or caregiver.";

  const EXAMPLE_ITEMS = Object.entries(TOPICS).flatMap(
    ([topic, content]) =>
      content.examples.map(text => ({ topic, text }))
  );

  let extractor = null;
  let exampleVectors = [];
  let loadingPromise = null;
  let busy = false;
  let uiReady = false;

  const byId = id => document.getElementById(id);

  function display(message) {
    const desktop = byId("aiResponse");
    const vr = byId("vrResponse");

    if (desktop) {
      desktop.textContent = message;
    }

    if (vr) {
      vr.setAttribute("value", message);
    }
  }

  function publishStatus(status, message) {
    display(message);

    window.dispatchEvent(
      new CustomEvent("clinic-guide-status", {
        detail: { status, message }
      })
    );
  }

  function publishResult(result) {
    display(result.answer);

    window.dispatchEvent(
      new CustomEvent("clinic-guide-result", {
        detail: result
      })
    );

    // Do not log the user's question or personal information.
    console.info("[ClinicGuide]", {
      status: result.status,
      topic: result.topic,
      similarity: result.similarity,
      margin: result.margin,
      elapsedMs: result.elapsedMs
    });

    return result;
  }

  function setBusy(value) {
    busy = value;

    const askButton = byId("askButton");

    if (askButton) {
      askButton.disabled = value;
      askButton.textContent = value ? "Please wait..." : "Ask";
    }

    const response = byId("aiResponse");

    if (response) {
      response.setAttribute("aria-busy", String(value));
    }
  }

  function withTimeLimit(promise, milliseconds) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("AI_WAIT_TIMEOUT"));
      }, milliseconds);

      promise.then(
        value => {
          clearTimeout(timer);
          resolve(value);
        },
        error => {
          clearTimeout(timer);
          reject(error);
        }
      );
    });
  }

  async function loadModel() {
    if (extractor && exampleVectors.length > 0) {
      return;
    }

    if (!loadingPromise) {
      loadingPromise = (async () => {
        const { pipeline, env } = await import(LIBRARY_URL);

        // This static website downloads model files from Hugging Face.
        env.allowLocalModels = false;

        // A single thread works without cross-origin isolation headers.
        env.backends.onnx.wasm.numThreads = 1;

        const loadedExtractor = await pipeline(
          "feature-extraction",
          MODEL_ID,
          {
            quantized: true,
            revision: MODEL_REVISION
          }
        );

        const embeddings = await loadedExtractor(
          EXAMPLE_ITEMS.map(item => item.text),
          {
            pooling: "mean",
            normalize: true
          }
        );

        exampleVectors = embeddings.tolist();
        extractor = loadedExtractor;
      })().catch(error => {
        loadingPromise = null;
        throw error;
      });
    }

    await loadingPromise;
  }

  async function init() {
    await withTimeLimit(loadModel(), WAIT_LIMIT_MS);

    return {
      status: "ready",
      model: MODEL_ID
    };
  }

  function dotProduct(first, second) {
    let sum = 0;

    for (let i = 0; i < first.length; i += 1) {
      sum += first[i] * second[i];
    }

    return sum;
  }

  async function classify(question) {
    const embedding = await extractor(question, {
      pooling: "mean",
      normalize: true
    });

    const questionVector = embedding.tolist()[0];

    const scores = Object.fromEntries(
      Object.keys(TOPICS).map(topic => [topic, -1])
    );

    EXAMPLE_ITEMS.forEach((item, index) => {
      // Normalized embeddings: dot product equals cosine similarity.
      const similarity = dotProduct(
        questionVector,
        exampleVectors[index]
      );

      scores[item.topic] = Math.max(
        scores[item.topic],
        similarity
      );
    });

    const ranking = Object.entries(scores).sort(
      (first, second) => second[1] - first[1]
    );

    const [bestTopic, bestScore] = ranking[0];
    const margin = bestScore - ranking[1][1];

    const accepted =
      bestScore >= MIN_SIMILARITY &&
      margin >= MIN_MARGIN;

    return {
      status: accepted ? "answered" : "unknown",
      topic: accepted ? bestTopic : null,
      answer: accepted
        ? TOPICS[bestTopic].answer
        : UNKNOWN_ANSWER,
      similarity: Number(bestScore.toFixed(3)),
      margin: Number(margin.toFixed(3))
    };
  }

  async function ask(rawQuestion) {
    if (busy) {
      return {
        status: "busy",
        topic: null,
        answer: "Please wait for the current question."
      };
    }

    const question = String(rawQuestion ?? "").trim();

    if (!question) {
      return publishResult({
        status: "empty",
        topic: null,
        answer: "Please type a question first."
      });
    }

    if (question.length > MAX_QUESTION_LENGTH) {
      return publishResult({
        status: "too_long",
        topic: null,
        answer:
          "Please ask one short question using no more than " +
          MAX_QUESTION_LENGTH + " characters."
      });
    }

    const startedAt = performance.now();
    setBusy(true);

    try {
      if (!extractor) {
        publishStatus(
          "loading",
          "Preparing the AI guide. The first download may take a minute. " +
          "You can also use the topic buttons below."
        );
      } else {
        publishStatus("thinking", "Thinking about your question...");
      }

      await init();

      // Keep inference serialized. A second question cannot start
      // until this one has completed.
      const result = await classify(question);

      return publishResult({
        ...result,
        elapsedMs: Math.round(performance.now() - startedAt)
      });
    } catch (error) {
      // Log only a short error identifier, never the question.
      console.warn(
        "[ClinicGuide] Model unavailable:",
        error?.name || "Error"
      );

      return publishResult({
        status: "unavailable",
        topic: null,
        answer:
          "The AI guide is unavailable or is still downloading. " +
          "Please choose a topic below, or try Ask again later.",
        elapsedMs: Math.round(performance.now() - startedAt)
      });
    } finally {
      setBusy(false);
    }
  }

  function chooseTopic(topic) {
    if (busy) {
      // The manual alternative should remain usable during loading.
      // Its result is explicitly marked as manual, not AI.
      display(TOPICS[topic]?.answer || UNKNOWN_ANSWER);
    }

    if (!Object.prototype.hasOwnProperty.call(TOPICS, topic)) {
      return null;
    }

    return publishResult({
      status: "manual",
      topic,
      answer: TOPICS[topic].answer,
      similarity: null,
      margin: null
    });
  }

  let speechRecognition = null;

  function startVoiceQuestion() {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      publishStatus(
        "voice_unsupported",
        "Voice is not supported here. Please type a question or choose a topic."
      );
      return;
    }

    if (speechRecognition) {
      publishStatus(
        "voice_busy",
        "The microphone is already listening."
      );
      return;
    }

    // A browser may send speech audio to an external service.
    // Permission is requested only after the visitor starts voice input.
    const recognition = new SpeechRecognition();
    speechRecognition = recognition;

    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

    recognition.onresult = event => {
      const spoken = event.results?.[0]?.[0]?.transcript?.trim();

      if (spoken) {
        const input = byId("questionInput");
        if (input) input.value = spoken;
        void ask(spoken);
      } else {
        publishStatus(
          "no_speech",
          "I could not hear that. Please try text or a topic button."
        );
      }
    };

    recognition.onerror = event => {
      publishStatus(
        "voice_error",
        "Voice unavailable (" +
          String(event.error || "error") +
          "). Please use text or a topic button."
      );
    };

    recognition.onend = () => {
      speechRecognition = null;
    };

    try {
      recognition.start();
      publishStatus(
        "listening",
        "Listening... Please ask one short question in English."
      );
    } catch (error) {
      speechRecognition = null;
      publishStatus(
        "voice_error",
        "Microphone could not start. Please type or choose a topic."
      );
    }
  }

  function addManualTopics() {
    if (byId("guideManualTopics")) {
      return;
    }

    const response = byId("aiResponse");

    if (!response) {
      return;
    }

    const section = document.createElement("section");
    section.id = "guideManualTopics";
    section.setAttribute("aria-label", "Manual topic selection");

    const heading = document.createElement("h2");
    heading.textContent = "Or choose a topic";
    section.appendChild(heading);

    const note = document.createElement("p");
    note.textContent =
      "These buttons work without AI and without a microphone.";
    note.style.fontSize = "12px";
    section.appendChild(note);

    const controls = document.createElement("div");
    controls.className = "controls";
    controls.style.flexWrap = "wrap";

    Object.entries(TOPICS).forEach(([topic, content]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = content.label;

      button.addEventListener("click", () => {
        chooseTopic(topic);
      });

      controls.appendChild(button);
    });

    section.appendChild(controls);
    response.insertAdjacentElement("afterend", section);
  }

  function bindInterface() {
    if (uiReady) {
      return;
    }

    uiReady = true;

    const input = byId("questionInput");
    const askButton = byId("askButton");
    const micButton = byId("micButton");
    const privacyNotice = byId("privacyNotice");

    if (input) {
      input.maxLength = MAX_QUESTION_LENGTH;

      input.addEventListener("keydown", event => {
        if (event.key === "Enter" && !event.isComposing) {
          event.preventDefault();
          void ask(input.value);
        }
      });
    }

    if (askButton && input) {
      askButton.addEventListener("click", () => {
        void ask(input.value);
      });
    }

    if (micButton) {
      micButton.addEventListener("click", startVoiceQuestion);
    }

    if (privacyNotice) {
      privacyNotice.textContent =
        "Text questions are processed by an AI model in this browser. " +
        "Model and library files are downloaded from external hosts. " +
        "This module does not save or send your typed questions. " +
        "Please do not enter names or personal medical information. " +
        "Voice input requires permission; browser speech services may " +
        "process audio outside the device. " +
        "This tour is educational and does not replace a doctor.";
    }

    addManualTopics();

    display(
      "Ask in English about a stethoscope, a thermometer, " +
      "or a regular check-up. The AI loads when you first press Ask."
    );
  }

  window.ClinicGuide = {
    init,
    ask,
    chooseTopic
  };

  window.startVoiceQuestion = startVoiceQuestion;

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      bindInterface,
      { once: true }
    );
  } else {
    bindInterface();
  }
})();
