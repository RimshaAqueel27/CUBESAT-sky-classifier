# Sky Classifier Demo

Create a polished CubeSat Cloud Intelligence ML demo.

Purpose:

This is a prototype for a CubeSat that captures cloud images and uses

AI classification to decide which images are important enough to

transmit to Earth, reducing unnecessary communication and saving energy.

Build ONE dashboard with:

1. Image upload

- Drag-and-drop cloud image upload

- Show image preview

- Button: "Analyze Image"

2. Cloud classification

Classes:

- Cumulus

- Stratus

- Cirrus

- Cumulonimbus

- Clear Sky

After analysis, show:

- Predicted cloud type

- Confidence percentage

- Importance score

- Transmission priority

- Recommendation: TRANSMIT / OPTIONAL / DO NOT TRANSMIT

3. Use this demo decision logic:

Cumulonimbus priority = 100

Cumulus priority = 60

Stratus priority = 40

Cirrus priority = 30

Clear Sky priority = 10

Importance Score = Priority × Confidence

If score >= 70:

HIGH PRIORITY — TRANSMIT

If score >= 40 and < 70:

MEDIUM PRIORITY — OPTIONAL TRANSMISSION

If score < 40:

LOW PRIORITY — DO NOT TRANSMIT

If confidence < 50%:

UNCERTAIN — TRANSMIT FOR GROUND ANALYSIS

4. Dashboard statistics:

- Images analyzed

- Images transmitted

- Images filtered

- Data reduction percentage

- Estimated energy saved

5. Add a "Mission Simulation" section.

Allow the user to simulate processing 100 images.

Show:

- Total images

- Transmitted images

- Filtered images

- Data reduction percentage

6. Clearly label the current classifier as DEMO ML MODEL if no real

trained model is connected yet. Do not falsely claim that predictions

come from a trained neural network.

7. Make the design futuristic but clean, inspired by satellite

mission-control dashboards. Use cards, charts, status badges and

clear typography.

The main message of the application should be:

"Classify intelligently. Transmit selectively. Save CubeSat energy."

Make the application functional and visually impressive.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/eac6f683-c579-4214-bd36-04b8f64f8afd).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
