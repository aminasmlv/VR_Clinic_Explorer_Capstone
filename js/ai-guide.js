"use strict";

// VR Clinic Explorer
// Module owner: Islamiya Okassova, 242322
//
// Features:
// - Semantic topic matching with a pretrained MiniLM model.
// - Text questions and optional English speech recognition.
// - Manual topic selection when AI or voice is unavailable.
// - Shared responses for desktop and VR.
//
// References:
// https://huggingface.co/docs/transformers.js/v2.17.2/en/api/pipelines
// https://huggingface.co/Xenova/all-MiniLM-L6-v2
// https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition
//
// The pretrained model produces sentence embeddings.
// We compare embeddings and select a prepared educational answer.
// No model training or fine-tuning is performed here.

(() => {
  const LIBRARY_URL =
    "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2";

  const MODEL_ID = "Xenova/all-MiniLM-L6-v2";
  const MODEL_REVISION = "main";

  // Initial development thresholds.
  // Validate them using separate development and evaluation questions.
  // Similarity is not a probability or an accuracy percentage.
  const MIN_SIMILARITY = 0.45;
  const MIN_MARGIN = 0.06;

  const MAX_QUESTION_LENGTH = 250;
  const MODEL_WAIT_LIMIT_MS = 90000;
  const VOICE_WAIT_LIMIT_MS = 25000;

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

  // Prevent an older AI response from replacing a newer manual choice.
  let responseVersion = 0;

  let voiceSession = null;
  let voiceNoticeAccepted = false;

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

    // Never log the question, transcript, or personal information.
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
    const response = byId("aiResponse");

    if (askButton) {
      askButton.disabled = value;
      askButton.textContent = value ? "Please wait..." : "Ask";
    }

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

        env.allowLocalModels = false;

        // Static hosting does not require cross-origin isolation
        // when the WASM runtime uses a single thread.
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
    await withTimeLimit(loadModel(), MODEL_WAIT_LIMIT_MS);

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
      // For normalized vectors, this is cosine similarity.
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
    stopListening(false);

    if (busy) {
      return {
        status: "busy",
        topic: null,
        answer: "Please wait for the current question."
      };
    }

    const question = String(rawQuestion ?? "").trim();
    const thisVersion = ++responseVersion;

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
        publishStatus(
          "thinking",
          "Thinking about your question..."
        );
      }

      await init();

      // A manual choice made during loading takes priority.
      if (thisVersion !== responseVersion) {
        return {
          status: "superseded",
          topic: null,
          answer: ""
        };
      }

      // Serialize model inference: do not run two questions together.
      const classified = await classify(question);

      const result = {
        ...classified,
        elapsedMs: Math.round(performance.now() - startedAt)
      };

      if (thisVersion !== responseVersion) {
        return {
          ...result,
          status: "superseded"
        };
      }

      return publishResult(result);
    } catch (error) {
      console.warn(
        "[ClinicGuide] Model unavailable:",
        error?.name || "Error"
      );

      const result = {
        status: "unavailable",
        topic: null,
        answer:
          "The AI guide is unavailable or is still downloading. " +
          "Please choose a topic below, or try Ask again later.",
        elapsedMs: Math.round(performance.now() - startedAt)
      };

      if (thisVersion !== responseVersion) {
        return {
          ...result,
          status: "superseded"
        };
      }

      return publishResult(result);
    } finally {
      setBusy(false);
    }
  }

  function chooseTopic(topic) {
    if (!Object.prototype.hasOwnProperty.call(TOPICS, topic)) {
      return null;
    }

    stopListening(false);

    // Invalidate a pending AI response without pretending
    // that the underlying inference has been cancelled.
    responseVersion += 1;

    return publishResult({
      status: "manual",
      topic,
      answer: TOPICS[topic].answer,
      similarity: null,
      margin: null
    });
  }

  function updateVoiceButton(active) {
    const button = byId("micButton");

    if (button) {
      button.textContent = active ? "Cancel voice" : "Speak";
      button.setAttribute("aria-pressed", String(active));
    }
  }

  function releaseVoiceSession(session) {
    clearTimeout(session.timer);

    if (voiceSession === session) {
      voiceSession = null;
      updateVoiceButton(false);
    }
  }

  function stopListening(showMessage = true) {
    const session = voiceSession;

    if (!session) {
      return;
    }

    // Ignore delayed results after cancellation.
    session.finished = true;
    releaseVoiceSession(session);

    try {
      session.recognition.abort();
    } catch {
      // Recognition may already have ended.
    }

    if (showMessage) {
      publishStatus(
        "voice_cancelled",
        "Voice input stopped. You can type your question or try again."
      );
    }
  }

  function startListening() {
    // A second activation cancels the current voice session.
    if (voiceSession) {
      stopListening();
      return;
    }

    if (busy) {
      return;
    }

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      publishStatus(
        "voice_unsupported",
        "Voice input is not supported in this browser. " +
        "Please type your question or choose a topic."
      );
      return;
    }

    if (!window.isSecureContext) {
      publishStatus(
        "voice_insecure",
        "Voice input needs HTTPS or a local development server. " +
        "You can still type your question."
      );
      return;
    }

    // Explain external speech processing before asking for access.
    // This choice is kept in memory only for the current page visit.
    if (!voiceNoticeAccepted) {
      const accepted = window.confirm(
        "Optional microphone access\n\n" +
        "Your browser's speech service may send audio to an external " +
        "server to turn your speech into text.\n\n" +
        "Our application does not save your audio or questions. " +
        "Please do not say names or personal medical information.\n\n" +
        "Choose OK to continue, or Cancel to use text input."
      );

      if (!accepted) {
        publishStatus(
          "voice_declined",
          "Microphone access was not requested. " +
          "Please type your question or choose a topic."
        );
        return;
      }

      voiceNoticeAccepted = true;
    }

    let recognition;

    try {
      recognition = new SpeechRecognition();
    } catch {
      publishStatus(
        "voice_unavailable",
        "Voice input could not start. Please use text input."
      );
      return;
    }

    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    const session = {
      recognition,
      finished: false,
      timer: null
    };

    voiceSession = session;
    updateVoiceButton(true);

    function fail(status, message) {
      if (session.finished || voiceSession !== session) {
        return;
      }

      session.finished = true;
      releaseVoiceSession(session);

      try {
        recognition.abort();
      } catch {
        // Recognition may already have stopped.
      }

      publishStatus(status, message);
    }

    recognition.onstart = () => {
      if (session.finished || voiceSession !== session) {
        return;
      }

      publishStatus(
        "listening",
        "Listening... Ask one short question in English. " +
        "Press Cancel voice to stop."
      );
    };

    recognition.onresult = event => {
      if (session.finished || voiceSession !== session) {
        return;
      }

      const transcript =
        event.results[event.resultIndex]?.[0]?.transcript?.trim() || "";

      session.finished = true;
      releaseVoiceSession(session);

      try {
        recognition.abort();
      } catch {
        // Recognition may already have stopped.
      }

      if (!transcript) {
        publishStatus(
          "voice_no_text",
          "I could not hear a question. Please try again or type it."
        );
        return;
      }

      const input = byId("questionInput");

      if (input) {
        input.value = transcript;
      }

      // Use exactly the same AI pipeline as typed questions.
      // Do not store or log the transcript.
      void ask(transcript);
    };

    recognition.onerror = event => {
      const messages = {
        "not-allowed":
          "Microphone access was not allowed. " +
          "You can type your question or choose a topic.",

        "service-not-allowed":
          "The browser's speech service is not allowed. " +
          "Please use text input.",

        "audio-capture":
          "No working microphone was available. " +
          "Check your microphone or use text input.",

        "no-speech":
          "No speech was detected. " +
          "Please try again or type your question.",

        "network":
          "The speech service could not connect. " +
          "Please type your question or choose a topic.",

        "language-not-supported":
          "English speech recognition is unavailable in this browser. " +
          "Please use text input.",

        "aborted":
          "Voice input stopped. You can type your question."
      };

      fail(
        "voice_error",
        messages[event.error] ||
          "Voice recognition failed. Please try text input."
      );
    };

    recognition.onnomatch = () => {
      fail(
        "voice_no_match",
        "The speech service could not understand the question. " +
        "Please try again or type it."
      );
    };

    recognition.onend = () => {
      if (session.finished || voiceSession !== session) {
        return;
      }

      session.finished = true;
      releaseVoiceSession(session);

      publishStatus(
        "voice_no_result",
        "Voice input ended without a question. " +
        "Please try again or type your question."
      );
    };

    publishStatus(
      "voice_starting",
      "Starting the microphone. Allow access if your browser asks, " +
      "then wait for Listening."
    );

    session.timer = setTimeout(() => {
      fail(
        "voice_timeout",
        "Voice input timed out and stopped. " +
        "Please try again or type your question."
      );
    }, VOICE_WAIT_LIMIT_MS);

    try {
      recognition.start();
    } catch {
      fail(
        "voice_start_failed",
        "The microphone could not start. " +
        "Try the Speak button with a mouse click or use text input."
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

      // Typing takes priority over an active voice session.
      input.addEventListener("input", () => {
        if (voiceSession) {
          stopListening();
        }
      });
    }

    if (askButton && input) {
      askButton.addEventListener("click", () => {
        void ask(input.value);
      });
    }

    if (micButton) {
      micButton.addEventListener("click", startListening);
      micButton.setAttribute("aria-pressed", "false");
    }

    if (privacyNotice) {
      privacyNotice.textContent =
        "Text questions are processed by an AI model in this browser. " +
        "Model and library files are downloaded from external hosts. " +
        "The microphone is optional. Your browser's speech service " +
        "may send audio to an external server for recognition. " +
        "This application does not save your audio or questions. " +
        "Please do not share names or personal medical information. " +
        "This educational tour does not replace a doctor.";
    }

    addManualTopics();

    display(
      "Ask in English about a stethoscope, a thermometer, " +
      "or a regular check-up. Type a question or press Speak. " +
      "The AI loads when you first ask a question."
    );
  }

  window.ClinicGuide = {
    init,
    ask,
    chooseTopic,
    startListening,
    stopListening
  };

  // Amina's scene.js calls this function from the VR voice button.
  window.startVoiceQuestion = startListening;

  window.addEventListener("pagehide", () => {
    stopListening(false);
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopListening();
    }
  });

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