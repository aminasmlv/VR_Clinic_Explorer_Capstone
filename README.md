# VR Clinic Explorer

VR Clinic Explorer is a browser-based virtual clinic tour that introduces children aged 4–10 to a regular check-up. The experience is designed for children in Kazakhstan and their parents or caregivers.

This is an educational prototype. 

## Project links

- **Live application:** https://aminasmlv.github.io/VR_Clinic_Explorer_Capstone/
- **Source repository:** https://github.com/aminasmlv/VR_Clinic_Explorer_Capstone

## Project brief

- **Course:** AR/VR/XR Applications
- **Group:** AIB-2401
- **Brief:** B3 - Healthcare: Children's Clinic
- **Intended users:** Children aged 4–10 and their parents or caregivers
- **Clinic partner:** The prototype was not commissioned by or developed with a specific clinic.
- **Platform:** Browser-based 3D/WebXR experience with desktop controls

## Experience

The tour has three stages:

1. **Welcome** — meet the clinic guide and check in.
2. **Examination** — explore a stethoscope, thermometer, and examination bed.
3. **Preparation and Finish** — answer a short three-question quiz and complete or restart the tour.

Users can navigate with labelled controls. Desktop mode supports mouse interaction, and immersive mode supports gaze selection. Walking is optional.

## Features

- Three connected clinic stages with Back and Next navigation
- Interactive, labelled medical objects with short explanations
- Animated 3D robot guide
- Three-question check-up quiz with feedback and a restart option
- Clinic Guide questions by text or optional speech input
- Manual topic buttons for a stethoscope, thermometer, and regular check-up
- Fallback messages for unsupported speech input, an unavailable AI model, and out-of-scope questions
- Desktop browser mode and WebXR emulator testing

## Technology

- A-Frame 1.8.0
- A-Frame Extras 7.7.0
- HTML, CSS, and JavaScript
- Browser Web Speech API for optional speech recognition
- Transformers.js 2.17.2
- Pretrained model: `Xenova/all-MiniLM-L6-v2`
- Model revision: `751bff37182d3f1213fa05d7196b954e230abad9`

The AI guide uses a pretrained sentence-embedding model to match English questions to three supported topics. It displays prepared educational answers. 

The AI model and JavaScript libraries are downloaded from external hosts when needed. An internet connection is required for the first model load. Offline operation has not been established.

## Run locally

You need Visual Studio Code, the Live Server extension, a modern browser, and an internet connection.

1. Open the project folder in Visual Studio Code.
2. Open `index.html`.
3. Click **Go Live** in the bottom-right corner of Visual Studio Code. You can also right-click `index.html` and select **Open with Live Server**.
4. Live Server opens the local project in your browser. The address is usually similar to `http://127.0.0.1:5500/index.html`.

The local address works only while Live Server is running on your computer. It is not the public project link. To use the published application, open the Live application link above.

Speech recognition availability depends on the browser and its speech service. If microphone input is unavailable or permission is denied, type a question or select one of the prepared topics.

## Controls

- **Desktop:** Select labelled objects and interface buttons with the mouse. Use Back and Next to move between stages.
- **Desktop view:** Drag an empty area of the scene to look around. Walking is optional.
- **WebXR:** Enter immersive mode in a compatible browser or emulator and use gaze selection as indicated by the on-screen instructions.
- **Restart:** Use Start Again on the completion screen to restart the tour.

## Evaluation summary

### AI evaluation

The recorded semantic evaluation passed 16 of 16 developer-authored cases: 12 supported-topic questions were matched as expected, and 4 out-of-scope questions were rejected. The recorded median warm response time was 14 ms, and model initialization took 778 ms.

A separate simulated model-initialization failure test passed 2 of 2 cases. This was a controlled failure scenario, not a test of an actual internet outage.

### User testing

The final report describes testing with five participants: three parents or caregivers, one 10-year-old child, and one university student. All five participants completed the assigned tasks.

| Measure | Result |
|---|---:|
| Average completion time without AI | 272 seconds |
| Average completion time with AI | 231 seconds |
| Tasks completed by each participant | 4 of 4 |
| Average ease-of-use rating | 4.4 / 5 |
| Average comfort rating | 4.4 / 5 |

The reported average completion time was 15.1% lower in the AI condition. 

### Performance observations

- **Microsoft Edge desktop observation reported in the final report:** generally 59–61 FPS, with occasional drops to approximately 50 FPS.
- **Chrome on a Huawei laptop using Immersive Web Emulator and local Live Server, 20 November 2026:** screenshot readings were 31 FPS in Welcome, 30 FPS in Examination, and 31 FPS in Preparation and Finish.
- **Physical Meta Quest:** not tested. Performance against a 72-FPS Quest target remains unverified.

The emulator readings describe Chrome running on the laptop with the emulator. They are not measurements from a physical VR headset.

## Privacy, safety, and limitations

- The tour is educational and does not provide diagnoses or treatment.
- Children should use the experience with adult supervision.
- Microphone access is optional. The browser's speech-recognition service may process audio through an external service.
- The application does not intentionally store questions, speech transcripts, or audio. Do not enter names or personal medical information.
- AI responses are limited to three English-language topics. For personal health questions, ask a doctor or caregiver.
- Speech recognition, WebXR availability, and performance depend on the browser and device.
- Some distant scene labels may be small. English-only content and the need to learn gaze selection are current accessibility limitations.


## Team

| Team member | Student ID | Main responsibility |
|---|---:|---|
| Amina Smailova | 241482 | VR environment, interface, navigation, gaze interactions, animation, performance work, and deployment |
| Islamiya Okassova | 242322 | AI guide, speech input, topic matching, text and manual fallback, AI evaluation, and privacy analysis |

The team integrated the modules, reviewed the complete application, and prepared the project submission together.

## Credits

The robot model is the `RobotExpressive` sample from the Three.js examples:
https://github.com/mrdoob/three.js/tree/dev/examples/models/gltf/RobotExpressive

- A-Frame 1.8.0: https://aframe.io/docs/1.8.0/introduction/
- A-Frame Extras: https://github.com/c-frame/aframe-extras
- Transformers.js 2.17.2: https://huggingface.co/docs/transformers.js/v2.17.2/en/api/pipelines
- `Xenova/all-MiniLM-L6-v2`: https://huggingface.co/Xenova/all-MiniLM-L6-v2
- Web Speech API — SpeechRecognition: https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition
- WebXR Device API: https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API