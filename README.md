# ULTI REVIEWER

A beginner-friendly multi-course quiz and study website. It uses plain HTML, CSS, JavaScript, JSON, and browser LocalStorage—no framework or database is required.

Included subjects:

- **IT0103 Networking** — 55 original CCNA 200-301 ENSA practice questions
- **GED0083 Fluid and Thermal Physics** — 38 questions from the supplied formative reviewer
- **IT0035 Operating Systems** — 3 quiz-ready questions from the recoverable formative and seatwork material

The IT0035 source was partial. Items with missing question text or an unverified answer were not invented.

## Run the website

You can double-click `index.html` to run the reviewer directly. `course-data.js` contains local fallback copies for browsers that block JSON requests.

For normal development, you can also open the folder in Visual Studio Code, install the **Live Server** extension by Ritwick Dey, then right-click `index.html` and choose **Open with Live Server**. Live Server uses the JSON question files directly and usually opens at `http://127.0.0.1:5500`.

For GitHub hosting, upload the complete project and enable **GitHub Pages** for the repository. Do not open the file through GitHub's source-code viewer; use the generated `https://username.github.io/repository-name/` Pages address.

## Project files

- `index.html` — page structure and accessible interface
- `style.css` — dark responsive design
- `script.js` — course navigation, quizzes, scoring, reviews, keyboard controls, and saved progress
- `course-data.js` — subject catalog and local-file fallback question banks
- `questions.json` — IT0103 Networking question bank
- `questions.js` — legacy IT0103 local fallback
- `data/ged0083.json` — GED0083 question bank
- `data/it0035.json` — IT0035 question bank
- `assets/` — authorized diagrams and images

## Add a question

Add an object to the appropriate course JSON file. Every question needs a unique numeric `id` within that course, stable option IDs, and a `category` used by the Quiz Type selector.

If you want direct double-click (`file://`) mode to include your new question, make the same change inside the matching course's `questions` array in `course-data.js`. GitHub Pages and Live Server use the JSON files as the primary source.

```json
{
  "id": 56,
  "question": "Which protocol automatically assigns IPv4 settings to clients?",
  "type": "single",
  "options": [
    {"id": "A", "text": "DNS"},
    {"id": "B", "text": "DHCP"},
    {"id": "C", "text": "NTP"},
    {"id": "D", "text": "SNMP"}
  ],
  "correctAnswers": ["B"],
  "explanation": "DHCP can provide an IPv4 address, mask, gateway, and other options.",
  "image": null,
  "source": "Original practice question",
  "category": "Addressing Services"
}
```

For a multiple-answer question, use `"type": "multiple"` and list every correct stable ID:

```json
"correctAnswers": ["A", "C"]
```

Correctness is checked by option ID, so shuffling displayed choices never changes the answer.

## Add an image

1. Place an image you are authorized to use inside `assets/`.
2. Set the question's `image` value to its relative path, such as:

```json
"image": "assets/my-diagram.png"
```

3. Use `null` when a question has no image.

## Two-chance system

- A correct first attempt increases the current streak and first-try score.
- A wrong first attempt resets the streak and allows one more scored attempt without revealing the answer.
- A correct second attempt is recorded separately and does not restore the streak.
- After two wrong attempts, the correct option is shown. The learner must select that exact answer or combination and submit it before the Next button is enabled.
- The final confirmation is not counted as a correct scored attempt.

For multiple-answer questions, only the complete correct combination is accepted. Partial combinations are incorrect attempts.

## Streak system

Only consecutive first-try correct answers increase the streak. A wrong first attempt resets it to zero. The best streak is retained for the session, and a small message appears at each five-answer milestone.

## Saved progress

Each subject saves its own active question order, shuffled option order, attempts, selected answers, counters, streaks, and completion status in browser LocalStorage using the `ultiReviewerSessionV1:` key prefix. Refreshing the page keeps the session. **Reset Saved Progress** deletes only the selected subject's saved quiz after confirmation.

Because LocalStorage belongs to one browser and site address, progress will not automatically move to another browser, device, or Live Server port.

## Keyboard controls

- `1`–`6`: select or toggle the displayed answer at that position
- `Enter`: submit the current answer or continue after a correct confirmation

Mouse, touch, and normal keyboard tab navigation are also supported.
