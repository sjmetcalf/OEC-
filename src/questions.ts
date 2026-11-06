export const topics = [
  "Scene & legal",
  "Assessment",
  "Airway & breathing",
  "Shock & bleeding",
  "Trauma",
  "Musculoskeletal",
  "Medical",
  "Environment",
] as const;

export type Topic = (typeof topics)[number];

export type Question = {
  id: string;
  topic: Topic;
  prompt: string;
  choices: [string, string, string, string];
  answer: 0 | 1 | 2 | 3;
  explanation: string;
};

export const questions: Question[] = [
  {
    id: "scene-1",
    topic: "Scene & legal",
    prompt: "You arrive at a skier who is down just below a merge. What comes first?",
    choices: [
      "Open the airway and check breathing",
      "Confirm the scene is safe for you, the patient, and other skiers",
      "Ask for a medical history",
      "Apply a traction splint",
    ],
    answer: 1,
    explanation:
      "Scene safety comes before patient contact. A busy merge can injure the rescuer and turn one patient into several.",
  },
  {
    id: "scene-2",
    topic: "Scene & legal",
    prompt: "A competent adult with a possible wrist fracture understands the risks and refuses care. What do you do?",
    choices: [
      "Treat them anyway, because the injury looks painful",
      "Honor the refusal, document it, and advise them what to watch for",
      "Restrain the arm and transport",
      "Wait until they lose consciousness, then begin care",
    ],
    answer: 1,
    explanation:
      "A competent adult can refuse care. Explain the risks in plain language, document the refusal, and leave the door open if they change their mind.",
  },
  {
    id: "scene-3",
    topic: "Scene & legal",
    prompt: "You have started care for an unresponsive snowboarder. When can you leave?",
    choices: [
      "As soon as the bleeding slows",
      "When your shift ends",
      "When someone with equal or higher training takes over, or the patient is transferred",
      "After you radio a report, even if nobody else is on scene",
    ],
    answer: 2,
    explanation:
      "Once you begin care, leaving before an appropriate handoff is abandonment. Stay until transfer to equal or higher care.",
  },
  {
    id: "assess-1",
    topic: "Assessment",
    prompt: "An unresponsive patient opens their eyes and pulls away when you pinch the shoulder. How do you rate responsiveness?",
    choices: ["Alert", "Verbal", "Pain", "Unresponsive"],
    answer: 2,
    explanation:
      "AVPU: they do not respond to voice, but they do respond to pain. That is P.",
  },
  {
    id: "assess-2",
    topic: "Assessment",
    prompt: "Which set belongs in a SAMPLE history?",
    choices: [
      "Signs, allergies, medications, past history, last intake, events",
      "Scene, airway, motor, pulse, lungs, exposure",
      "Shock, airway, movement, pain, level, exam",
      "Splint, align, monitor, pulse, log-roll, evacuate",
    ],
    answer: 0,
    explanation:
      "SAMPLE is Signs/symptoms, Allergies, Medications, Past history, Last oral intake, and Events leading up to the injury or illness.",
  },
  {
    id: "assess-3",
    topic: "Assessment",
    prompt: "During the primary assessment you are mainly looking for:",
    choices: [
      "A complete past medical history",
      "Immediate threats to life",
      "The exact mechanism of a sprain",
      "Which toboggan will be fastest",
    ],
    answer: 1,
    explanation:
      "The primary assessment finds and treats life threats: airway, breathing, circulation, and severe bleeding. The detailed story comes after those are handled.",
  },
  {
    id: "air-1",
    topic: "Airway & breathing",
    prompt: "A fallen skier is unresponsive and snoring. You do not suspect a spinal injury. What is the first airway move?",
    choices: [
      "Head-tilt, chin-lift",
      "Abdominal thrusts",
      "Finger sweep of the mouth",
      "Sit them upright and have them cough",
    ],
    answer: 0,
    explanation:
      "Snoring in an unresponsive patient usually means the tongue is blocking the airway. A head-tilt, chin-lift opens it when spinal injury is not suspected.",
  },
  {
    id: "air-2",
    topic: "Airway & breathing",
    prompt: "You suspect a spinal injury and the unresponsive patient needs an airway opened. Which technique fits?",
    choices: [
      "Jaw thrust",
      "Deep head-tilt",
      "Recovery position immediately, without checking breathing",
      "Traction on the neck",
    ],
    answer: 0,
    explanation:
      "A jaw thrust opens the airway while limiting movement of the neck when spinal injury is suspected.",
  },
  {
    id: "air-3",
    topic: "Airway & breathing",
    prompt: "A guest is anxious, speaking in short phrases, and using neck muscles to breathe after a collision. This breathing is:",
    choices: [
      "Normal for cold air",
      "Inadequate, and a reason to treat this as a life threat",
      "Only a problem if they stop talking entirely",
      "Expected, and safe to finish a full history first",
    ],
    answer: 1,
    explanation:
      "Two- or three-word speech, anxiety, and accessory-muscle use mean breathing is not adequate. Support breathing and arrange rapid transport.",
  },
  {
    id: "shock-1",
    topic: "Shock & bleeding",
    prompt: "Bright red blood is pulsing from a thigh laceration. The first bleeding-control step is:",
    choices: [
      "Direct pressure with a dressing",
      "Ice and elevation only",
      "A warm drink",
      "Removing clots so the wound can be inspected",
    ],
    answer: 0,
    explanation:
      "Direct pressure is the first move for external bleeding. Do not peel off a dressing that is controlling the bleed; add more and keep pressure on.",
  },
  {
    id: "shock-2",
    topic: "Shock & bleeding",
    prompt: "Which set of findings should make you think of shock?",
    choices: [
      "Slow strong pulse, warm dry skin, and a joke about the fall",
      "Fast weak pulse, pale cool skin, and increasing anxiety or confusion",
      "A normal pulse and hunger",
      "Localized bruising with no other changes",
    ],
    answer: 1,
    explanation:
      "Shock is inadequate perfusion. Watch for a rapid weak pulse, cool pale clammy skin, and a changing mental status. Control bleeding, keep the patient warm, and transport.",
  },
  {
    id: "shock-3",
    topic: "Shock & bleeding",
    prompt: "A ski pole is impaled in the thigh and bleeding is controlled around it. You should:",
    choices: [
      "Pull the pole out so you can pack the wound",
      "Leave it in place and stabilize it",
      "Cut the pole flush with the skin and forget the rest",
      "Push the pole deeper so the tip is buried",
    ],
    answer: 1,
    explanation:
      "An impaled object may be tamponading bleeding. Stabilize it in place and transport. Removal is for a physician, aside from rare airway exceptions.",
  },
  {
    id: "trauma-1",
    topic: "Trauma",
    prompt: "After a high-speed tree strike, the patient is confused and has midline neck pain. Your spinal plan is:",
    choices: [
      "Let them walk to the aid room to see if the pain fades",
      "Limit spinal motion and arrange careful transport",
      "Sit them up and have them rotate the neck to test range",
      "Ignore the neck because the chief complaint is a wrist",
    ],
    answer: 1,
    explanation:
      "A significant mechanism plus midline spinal pain and altered mental status calls for spinal motion restriction and a careful extrication, not a range-of-motion test.",
  },
  {
    id: "trauma-2",
    topic: "Trauma",
    prompt: "A closed lower-leg deformity has a present pedal pulse. Before and after splinting you compare:",
    choices: [
      "Boot size",
      "Circulation, sensation, and movement",
      "Only the color of the boot",
      "How loud the patient is",
    ],
    answer: 1,
    explanation:
      "Check circulation, sensation, and movement distal to the injury before and after splinting. A splint that erases a pulse needs to be adjusted.",
  },
  {
    id: "trauma-3",
    topic: "Trauma",
    prompt: "Bone is visible in an open lower-leg fracture. You should:",
    choices: [
      "Push the bone back under the skin",
      "Cover the wound with a sterile dressing and splint as it lies",
      "Pour snow into the wound to numb it",
      "Leave it open to the air so it can dry",
    ],
    answer: 1,
    explanation:
      "Do not replace protruding bone. Cover the open wound, control bleeding, and splint in the position found when pulses are present.",
  },
  {
    id: "msk-1",
    topic: "Musculoskeletal",
    prompt: "A shoulder looks squared-off after a fall, and the patient will not move it. Pulses and sensation in the hand are normal. Best next step:",
    choices: [
      "Sling and swathe in the position of comfort",
      "Pull the arm until the shoulder pops back in",
      "Have them do push-ups to test strength",
      "Ignore it because the hand still works",
    ],
    answer: 0,
    explanation:
      "Support the limb where it is comfortable, usually with a sling and swathe. Do not attempt to reduce a dislocation on the hill.",
  },
  {
    id: "msk-2",
    topic: "Musculoskeletal",
    prompt: "You are splinting a deformed wrist. The splint should:",
    choices: [
      "Stop above the injury so the joint can still flop",
      "Immobilize the bone ends and the joints above and below",
      "Be tight enough to stop the radial pulse",
      "Be skipped if the patient can still wiggle the fingers",
    ],
    answer: 1,
    explanation:
      "A useful splint stabilizes the injury and the joint above and below it, padded, and checked so distal circulation is still present.",
  },
  {
    id: "msk-3",
    topic: "Musculoskeletal",
    prompt: "A femur hurts badly after a collision, the thigh is swollen, and there is no open wound. This injury can:",
    choices: [
      "Bleed enough internally to cause shock",
      "Only cause local bruising",
      "Be walked off if the boot still fits",
      "Wait until the end of the day",
    ],
    answer: 0,
    explanation:
      "A femur fracture can hide a large amount of blood in the thigh. Treat for shock and transport; do not have the patient walk on it.",
  },
  {
    id: "med-1",
    topic: "Medical",
    prompt: "A guest suddenly has a facial droop, slurred speech, and one arm that drifts down. You should:",
    choices: [
      "Give them water and have them lie flat in the lodge for an hour",
      "Recognize a possible stroke and arrange immediate transport",
      "Walk them around until the speech clears",
      "Treat it as fatigue from altitude and wait",
    ],
    answer: 1,
    explanation:
      "Face, arm, and speech changes are stroke findings. Note the time they started and get the patient to definitive care without delay.",
  },
  {
    id: "med-2",
    topic: "Medical",
    prompt: "A known diabetic is confused, sweaty, and can swallow safely. What can you give?",
    choices: [
      "Oral glucose or a sugary source they can swallow",
      "Nothing by mouth, even though they swallow normally",
      "Insulin from another guest's kit",
      "Coffee only",
    ],
    answer: 0,
    explanation:
      "Hypoglycemia in a patient who can protect their airway is treated with oral sugar. If they cannot swallow, do not force anything into the mouth.",
  },
  {
    id: "med-3",
    topic: "Medical",
    prompt: "A patient is actively seizing on the snow. The right immediate action is:",
    choices: [
      "Hold them down and put a glove in the mouth",
      "Protect the head, move hazards, and do not restrain or insert anything in the mouth",
      "Pour water in the mouth",
      "Sit them upright and ask history questions",
    ],
    answer: 1,
    explanation:
      "Protect the patient from injury, do not restrain the movements, and never place an object in the mouth. After the seizure, check the airway and breathing.",
  },
  {
    id: "env-1",
    topic: "Environment",
    prompt: "A wet, shivering guest has been sitting in the wind for a long time and is now confused and no longer shivering. You should:",
    choices: [
      "Handle them gently, get them out of wet clothes, and insulate them",
      "Have them jog in place to warm up",
      "Rub the arms and legs hard",
      "Give them alcohol",
    ],
    answer: 0,
    explanation:
      "Stopped shivering plus confusion can mean moderate or severe hypothermia. Rough handling can trigger a dangerous heart rhythm. Insulate and evacuate gently.",
  },
  {
    id: "env-2",
    topic: "Environment",
    prompt: "Fingers are white, wooden, and numb after a long cold ride. Refreezing is unlikely once you are indoors. You should not:",
    choices: [
      "Protect the tissue and arrange rewarming in a controlled setting",
      "Rub snow or massage the frozen fingers",
      "Remove wet gloves",
      "Separate the digits with dry gauze",
    ],
    answer: 1,
    explanation:
      "Do not rub frostbite. Rubbing damages frozen tissue. Protect it, remove wet clothing, and rewarm only when refreezing will not happen.",
  },
  {
    id: "env-3",
    topic: "Environment",
    prompt: "On a hot hike a companion is hot, dry, and confused, and then has a seizure. This is most consistent with:",
    choices: [
      "Heat stroke, which needs rapid cooling and emergency transport",
      "Ordinary heat cramps that resolve with stretching",
      "Mild thirst",
      "A problem that can wait until the car is packed",
    ],
    answer: 0,
    explanation:
      "Altered mental status in a hot patient is heat stroke, a life threat. Cool aggressively, especially the trunk and head, and transport.",
  },
];

export function questionsForTopic(topic: Topic | "All"): Question[] {
  if (topic === "All") return questions;
  return questions.filter((question) => question.topic === topic);
}

export function shuffle<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}
