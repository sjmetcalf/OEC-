import { questions } from "./bank.ts";

export type Chapter = {
  id: string;
  title: string;
  summary: string;
};

export const chapters: Chapter[] = [
  { id: "1", title: "1. Introduction", summary: "How OEC started, certification, and the legal side of care." },
  { id: "2", title: "2. Emergency systems", summary: "How emergency care systems are organized." },
  { id: "3", title: "3. Rescue basics", summary: "Rescuer safety, clothing, and infection control." },
  { id: "4", title: "4. Incident command", summary: "Incident command and triage." },
  { id: "5", title: "5. Moving patients", summary: "Lifting, moving, and transporting patients." },
  { id: "6", title: "6. Anatomy", summary: "How the body is put together." },
  { id: "7", title: "7. Assessment", summary: "Scene size-up, primary survey, and history." },
  { id: "8", title: "8. Communications", summary: "Radio reports and written documentation." },
  { id: "9", title: "9. Airway", summary: "Opening and protecting the airway." },
  { id: "10", title: "10. Shock", summary: "Recognizing and treating shock." },
  { id: "11", title: "11. Altered mental status", summary: "Stroke, sugar, seizures, and other causes of a changed mental status." },
  { id: "12", title: "12. Substances and Medications", summary: "Scene safety, poisonings, and assisting with prescribed medications." },
  { id: "13", title: "13. Respiratory", summary: "Breathing problems and respiratory emergencies." },
  { id: "14", title: "14. Allergies", summary: "Allergic reactions and anaphylaxis." },
  { id: "15", title: "15. Cardiovascular", summary: "Chest pain and other cardiovascular emergencies." },
  { id: "16", title: "16. Abdomen and pelvis", summary: "Abdominal, urinary, and reproductive problems." },
  { id: "17", title: "17. Childbirth", summary: "Pregnancy, childbirth, and obstetric emergencies." },
  { id: "18", title: "18. Trauma principles", summary: "How to approach a trauma patient." },
  { id: "19", title: "19. Soft tissue", summary: "Wounds, bleeding, and burns." },
  { id: "20", title: "20. Musculoskeletal", summary: "Fractures, dislocations, and splinting." },
  { id: "21", title: "21. Head and spine", summary: "Head, brain, and spinal injuries." },
  { id: "22", title: "22. Face, eye, and neck", summary: "Injuries of the face, eye, and neck." },
  { id: "23", title: "23. Chest trauma", summary: "Chest injuries that may not be obvious from the outside." },
  { id: "24", title: "24. Abdominal trauma", summary: "Abdominal and pelvic trauma." },
  { id: "25", title: "25. Cold injuries", summary: "Hypothermia, frostbite, and other cold injuries." },
  { id: "26", title: "26. Heat injuries", summary: "Heat exhaustion and heat stroke." },
  { id: "27", title: "27. Plants and animals", summary: "Plants, bites, and stings." },
  { id: "28", title: "28. Altitude", summary: "Altitude illness." },
  { id: "29", title: "29. Water", summary: "Drowning and other water emergencies." },
  { id: "30", title: "30. Pediatric", summary: "Assessing and treating children." },
  { id: "31", title: "31. Geriatric", summary: "How illness and injury present in older adults." },
  { id: "32", title: "32. Adaptive athletes", summary: "Caring for adaptive athletes." },
  { id: "33", title: "33. Behavioral", summary: "Behavioral emergencies and crisis response." },
  { id: "34", title: "34. Special operations", summary: "Special operations and ambulance operations." },
];

export { questions };

export type Question = {
  id: string;
  chapter: string;
  prompt: string;
  choices: [string, string, string, string];
  answer: 0 | 1 | 2 | 3;
  explanation: string;
};

export function chapterById(id: string): Chapter | undefined {
  return chapters.find((chapter) => chapter.id === id);
}

export function questionsIn(chapterId: string): Question[] {
  return questions.filter((question) => question.chapter === chapterId);
}

export function shuffle<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap]!, copy[index]!];
  }
  return copy;
}
