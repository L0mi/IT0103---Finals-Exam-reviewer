# CCNA 200-301 Interactive Quiz Reviewer

A beginner-friendly reviewer for Enterprise Networking, Security, and Automation (ENSA v7.0). It uses plain HTML, CSS, JavaScript, JSON, and browser LocalStorage—no framework or database is required.

The included 55 questions and diagram are original practice content. They are not copied from a third-party exam-answer bank. Always add only questions and images that you created or are authorized to use.

## Run the website

You can double-click `index.html` to run the reviewer directly. It includes a JavaScript fallback copy of the question bank for browsers that block local JSON requests.

For normal development, you can also open the folder in Visual Studio Code, install the **Live Server** extension by Ritwick Dey, then right-click `index.html` and choose **Open with Live Server**. Live Server uses `questions.json` directly and usually opens at `http://127.0.0.1:5500`.

For GitHub hosting, upload the complete project and enable **GitHub Pages** for the repository. Do not open the file through GitHub's source-code viewer; use the generated `https://username.github.io/repository-name/` Pages address.

## Project files

- `index.html` — page structure and accessible interface
- `style.css` — dark responsive design
- `script.js` — quiz, score, review, keyboard, and saved-progress logic
- `questions.json` — question bank
- `questions.js` — local-file fallback mirror of the question bank
- `assets/` — authorized diagrams and images

## Add a question

Add an object to the array in `questions.json`. Every question needs a unique numeric `id` and stable option IDs.

If you want direct double-click (`file://`) mode to include your new question, make the same change inside the `window.QUESTION_BANK` array in `questions.js`. GitHub Pages and Live Server use `questions.json` as the primary source.

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
  "source": "Original practice question"
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

The active question order, shuffled option order, attempts, selected answers, counters, streaks, and completion status are stored in browser LocalStorage under `ccnaEnsaReviewerSessionV1`. Refreshing the page keeps the session. **Reset Saved Progress** deletes it after confirmation.

Because LocalStorage belongs to one browser and site address, progress will not automatically move to another browser, device, or Live Server port.

## Keyboard controls

- `1`–`6`: select or toggle the displayed answer at that position
- `Enter`: submit the current answer or continue after a correct confirmation

Mouse, touch, and normal keyboard tab navigation are also supported.
