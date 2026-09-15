"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  Brain,
  ChevronRight,
  CircleCheck,
  CircleX,
  Cloud,
  CloudOff,
  Download,
  GitCompareArrows,
  Home,
  Eye,
  EyeOff,
  LayoutGrid,
  Layers3,
  ListOrdered,
  MoveHorizontal,
  Moon,
  Palette,
  Play,
  RotateCcw,
  RefreshCcw,
  Settings2,
  Shuffle,
  Sparkles,
  Smartphone,
  Sun,
  Target,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getRemoteProgress,
  readBackendConfig,
  removeBackendConfig,
  saveBackendConfig,
  saveRemoteSession,
} from "./backend-client";

type Suit = "spades" | "hearts" | "diamonds" | "clubs";
type Mode =
  | "mixed"
  | "card-position"
  | "position-card"
  | "previous"
  | "next"
  | "offset"
  | "neighborhood"
  | "sequence";
type AnswerStyle = "choices" | "direct";
type SessionLength = 10 | 20 | 52 | "continuous";
type ThemePreference = "system" | "light" | "dark";
type View = "home" | "practice" | "deck" | "progress" | "learn" | "settings";

type PlayingCard = {
  rank: string;
  suit: Suit;
  symbol: string;
  label: string;
  image: string;
};

type AnswerStep = {
  kind: "card" | "position";
  prompt: string;
  correctCard?: PlayingCard;
  correctPosition?: number;
  cardOptions?: PlayingCard[];
  positionOptions?: number[];
};

type Question = {
  mode: Exclude<Mode, "mixed">;
  promptCard?: PlayingCard;
  promptPosition?: number;
  helper?: string;
  steps: AnswerStep[];
};

type CardProgress = {
  position: number;
  total: number;
  accuracy: number;
  average_time_ms: number;
  last_answered_at?: string;
  review_priority?: number;
  recent_accuracy?: number;
  recent_average_time_ms?: number;
  recent_attempts?: RecentAttempt[];
  status: "strong" | "learning" | "weak" | "unseen";
};

type RecentAttempt = {
  correct: boolean;
  response_time_ms: number;
  answered_at?: string;
};

type ModeProgress = {
  mode: Exclude<Mode, "mixed">;
  total: number;
  accuracy: number;
  average_time_ms: number;
};

type ProgressSnapshot = {
  mastery_percent: number;
  total_answers: number;
  correct_answers: number;
  average_time_ms: number;
  range_start: number;
  range_end: number;
  cards: CardProgress[];
  modes?: ModeProgress[];
};

type AnswerRecord = {
  answer_id: string;
  answered_at: string;
  mode: Exclude<Mode, "mixed">;
  card_position: number;
  card_code: string;
  correct: boolean;
  response_time_ms: number;
  range_start: number;
  range_end: number;
  answer_style: AnswerStyle;
  outcome?: "answered" | "unknown";
};

type SessionPayload = {
  session: {
    session_id: string;
    started_at: string;
    ended_at: string;
    mode: Mode;
    answer_style: AnswerStyle;
    range_start: number;
    range_end: number;
    total_questions: number;
    correct_questions: number;
    average_time_ms: number;
    client_version: string;
  };
  answers: AnswerRecord[];
  settings: {
    range_start: number;
    range_end: number;
    mode: Mode;
    answer_style: AnswerStyle;
  };
};

const PENDING_SESSIONS_KEY = "mnemonica.pendingSessions.v1";
const LOCAL_PROGRESS_KEY = "mnemonica.progress.v2";
const PREFERENCES_KEY = "mnemonica.preferences.v2";
const THEME_PREFERENCE_KEY = "mnemonica.theme.v1";
const PUBLIC_BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
const SESSION_LENGTHS: SessionLength[] = [10, 20, 52, "continuous"];
const MODE_KEYS: Array<Exclude<Mode, "mixed">> = [
  "card-position", "position-card", "previous", "next", "offset", "neighborhood", "sequence",
];

type LocalPreferences = {
  start: number;
  end: number;
  mode: Mode;
  answerStyle: AnswerStyle;
  sessionLength: SessionLength;
  concealChoices: boolean;
};

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const MNEMONICA = [
  "4C", "2H", "7D", "3C", "4H", "6D", "AS", "5H", "9S", "2S",
  "QH", "3D", "QC", "8H", "6S", "5S", "9H", "KC", "2D", "JH",
  "3S", "8S", "6H", "10C", "5D", "KD", "2C", "3H", "8D", "5C",
  "KS", "JD", "8C", "10S", "KH", "JC", "7S", "10H", "AD", "4S",
  "7H", "4D", "AC", "9C", "JS", "QD", "7C", "QS", "10D", "6C",
  "AH", "9D",
];

const rankChoices = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

const suitData: Record<string, { suit: Suit; symbol: string; name: string }> = {
  S: { suit: "spades", symbol: "♠", name: "picas" },
  H: { suit: "hearts", symbol: "♥", name: "corazones" },
  D: { suit: "diamonds", symbol: "♦", name: "diamantes" },
  C: { suit: "clubs", symbol: "♣", name: "tréboles" },
};

const stack = MNEMONICA.map((code) => {
  const suitCode = code.slice(-1);
  const rank = code.slice(0, -1);
  const data = suitData[suitCode];
  const spokenRank: Record<string, string> = { A: "As", J: "Jota", Q: "Reina", K: "Rey" };
  const fileRank: Record<string, string> = { A: "1", J: "11", Q: "12", K: "13" };
  return {
    rank,
    suit: data.suit,
    symbol: data.symbol,
    label: `${spokenRank[rank] ?? rank} de ${data.name}`,
    image: `${PUBLIC_BASE_PATH}/cards/standard/${fileRank[rank] ?? rank}${suitCode.toLowerCase()}.svg`,
  } satisfies PlayingCard;
});

const modeInfo: Record<Mode, { title: string; short: string; description: string }> = {
  mixed: {
    title: "Entrenamiento mixto",
    short: "Mixto",
    description: "Combina los ejercicios disponibles en tu rango.",
  },
  "card-position": {
    title: "Carta → posición",
    short: "Carta → nº",
    description: "Ves una carta y dices dónde está.",
  },
  "position-card": {
    title: "Posición → carta",
    short: "Nº → carta",
    description: "Ves un número y encuentras la carta.",
  },
  previous: {
    title: "Carta anterior",
    short: "Anterior",
    description: "Encuentra la carta que va justo antes.",
  },
  next: {
    title: "Carta siguiente",
    short: "Siguiente",
    description: "Encuentra la carta que va justo después.",
  },
  offset: {
    title: "±N cartas",
    short: "±N cartas",
    description: "Navega varias posiciones hacia delante o atrás.",
  },
  neighborhood: {
    title: "Vecindario",
    short: "Vecindario",
    description: "Anterior, posición y siguiente de una carta.",
  },
  sequence: {
    title: "Secuencias",
    short: "Secuencia",
    description: "Continúa tres cartas hacia delante o atrás.",
  },
};

const allModes = Object.keys(modeInfo) as Mode[];

function emptyProgress(start = 1, end = 10): ProgressSnapshot {
  return {
    mastery_percent: 0,
    total_answers: 0,
    correct_answers: 0,
    average_time_ms: 0,
    range_start: start,
    range_end: end,
    cards: Array.from({ length: 52 }, (_, index) => ({
      position: index + 1,
      total: 0,
      accuracy: 0,
      average_time_ms: 0,
      status: "unseen" as const,
      review_priority: 1000,
      recent_accuracy: 0,
      recent_average_time_ms: 0,
      recent_attempts: [],
    })),
    modes: MODE_KEYS.map((mode) => ({ mode, total: 0, accuracy: 0, average_time_ms: 0 })),
  };
}

function statusFor(total: number, attempts: RecentAttempt[]): CardProgress["status"] {
  if (!total) return "unseen";
  const recent = attempts.slice(-10);
  const correct = recent.filter((attempt) => attempt.correct).length;
  const accuracy = recent.length ? (correct / recent.length) * 100 : 0;
  const lastFiveCorrect = recent.length >= 5 && recent.slice(-5).every((attempt) => attempt.correct);
  if (lastFiveCorrect) return "strong";
  return accuracy >= 70 ? "learning" : "weak";
}

function reviewPriority(card: CardProgress) {
  if (!card.total) return 1000;
  const recent = card.recent_attempts ?? [];
  const recentAccuracy = recent.length
    ? recent.filter((attempt) => attempt.correct).length / recent.length
    : 0;
  const recentAverage = recent.length
    ? recent.reduce((sum, attempt) => sum + attempt.response_time_ms, 0) / recent.length
    : 0;
  const ageDays = card.last_answered_at
    ? Math.max(0, (Date.now() - new Date(card.last_answered_at).getTime()) / 86_400_000)
    : 30;
  return Math.round(
    (1 - recentAccuracy) * 700
    + Math.min(recentAverage / 20, 220)
    + Math.min(ageDays, 30) * 5
    + Math.max(0, 5 - recent.length) * 45
    + (recent.length && !recent.at(-1)?.correct ? 180 : 0),
  );
}

function applySessionLocally(current: ProgressSnapshot | null, payload: SessionPayload): ProgressSnapshot {
  const base = current ? structuredClone(current) : emptyProgress(payload.session.range_start, payload.session.range_end);
  const oldTotal = base.total_answers;
  const oldTime = base.average_time_ms * oldTotal;
  const oldCorrect = base.correct_answers;

  for (const answer of payload.answers) {
    const card = base.cards[answer.card_position - 1];
    if (!card) continue;
    const previousCorrect = Math.round((card.accuracy / 100) * card.total);
    const previousTime = card.average_time_ms * card.total;
    card.total += 1;
    card.accuracy = Math.round(((previousCorrect + (answer.correct ? 1 : 0)) / card.total) * 100);
    card.average_time_ms = Math.round((previousTime + answer.response_time_ms) / card.total);
    card.last_answered_at = answer.answered_at;
    const recentAttempts = [
      ...(card.recent_attempts ?? []),
      { correct: answer.correct, response_time_ms: answer.response_time_ms, answered_at: answer.answered_at },
    ].slice(-10);
    const recentCorrect = recentAttempts.filter((attempt) => attempt.correct).length;
    card.recent_attempts = recentAttempts;
    card.recent_accuracy = Math.round((recentCorrect / recentAttempts.length) * 100);
    card.recent_average_time_ms = Math.round(
      recentAttempts.reduce((sum, attempt) => sum + attempt.response_time_ms, 0) / recentAttempts.length,
    );
    card.status = statusFor(card.total, recentAttempts);
    card.review_priority = reviewPriority(card);
  }

  const modes = base.modes ?? MODE_KEYS.map((mode) => ({ mode, total: 0, accuracy: 0, average_time_ms: 0 }));
  for (const answer of payload.answers) {
    const item = modes.find((candidate) => candidate.mode === answer.mode);
    if (!item) continue;
    const previousCorrect = Math.round((item.accuracy / 100) * item.total);
    const previousTime = item.average_time_ms * item.total;
    item.total += 1;
    item.accuracy = Math.round(((previousCorrect + (answer.correct ? 1 : 0)) / item.total) * 100);
    item.average_time_ms = Math.round((previousTime + answer.response_time_ms) / item.total);
  }

  const totalAnswers = oldTotal + payload.answers.length;
  const mastery = base.cards.reduce((sum, card) => {
    const recent = card.recent_attempts ?? [];
    const recentCorrect = recent.filter((attempt) => attempt.correct).length;
    const recentAccuracy = recent.length ? recentCorrect / recent.length : 0;
    const recentAverage = recent.length
      ? recent.reduce((sum, attempt) => sum + attempt.response_time_ms, 0) / recent.length
      : 0;
    const confidence = Math.min(recent.length / 5, 1);
    const speed = recentAverage ? Math.max(0.35, Math.min(1, 3000 / recentAverage)) : 0;
    return sum + recentAccuracy * confidence * speed;
  }, 0);

  return {
    ...base,
    mastery_percent: Math.round((mastery / 52) * 100),
    total_answers: totalAnswers,
    correct_answers: oldCorrect + payload.answers.filter((answer) => answer.correct).length,
    average_time_ms: totalAnswers
      ? Math.round((oldTime + payload.answers.reduce((sum, answer) => sum + answer.response_time_ms, 0)) / totalAnswers)
      : 0,
    range_start: payload.session.range_start,
    range_end: payload.session.range_end,
    modes,
  };
}

function guidedRange(progress: ProgressSnapshot | null) {
  const milestones = [10, 20, 30, 40, 52];
  const cards = progress?.cards ?? emptyProgress().cards;
  for (const end of milestones) {
    const ready = cards.slice(0, end).every((card) => card.total >= 3 && card.accuracy >= 80);
    if (!ready) {
      const firstToStrengthen = cards.slice(0, end).find((card) => card.total < 3 || card.accuracy < 80)?.position ?? 1;
      return { start: 1, end, firstToStrengthen };
    }
  }
  return { start: 1, end: 52, firstToStrengthen: 1 };
}

function sessionLengthLabel(value: SessionLength) {
  return value === "continuous" ? "Sin límite" : `${value} preguntas`;
}

function sample<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)];
}

function shuffle<T>(items: T[]) {
  return [...items].sort(() => Math.random() - 0.5);
}

function isModeAvailable(mode: Mode, rangeLength: number) {
  if (mode === "previous" || mode === "next" || mode === "offset") return rangeLength >= 2;
  if (mode === "neighborhood") return rangeLength >= 3;
  if (mode === "sequence") return rangeLength >= 4;
  return true;
}

function numberOptions(correct: number, start: number, end: number) {
  const pool = Array.from({ length: end - start + 1 }, (_, i) => start + i).filter(
    (value) => value !== correct,
  );
  return shuffle([correct, ...shuffle(pool).slice(0, 3)]);
}

function cardOptions(correctPosition: number, start: number, end: number) {
  const pool = Array.from({ length: end - start + 1 }, (_, i) => start + i).filter(
    (position) => position !== correctPosition,
  );
  return shuffle([correctPosition, ...shuffle(pool).slice(0, 3)]).map(
    (position) => stack[position - 1],
  );
}

function cardStep(prompt: string, position: number, start: number, end: number): AnswerStep {
  return {
    kind: "card",
    prompt,
    correctCard: stack[position - 1],
    cardOptions: cardOptions(position, start, end),
  };
}

function positionStep(prompt: string, position: number, start: number, end: number): AnswerStep {
  return {
    kind: "position",
    prompt,
    correctPosition: position,
    positionOptions: numberOptions(position, start, end),
  };
}

function makeQuestion(selectedMode: Mode, start: number, end: number): Question {
  const rangeLength = end - start + 1;
  let mode: Exclude<Mode, "mixed">;

  if (selectedMode === "mixed") {
    const available = allModes.filter(
      (candidate): candidate is Exclude<Mode, "mixed"> =>
        candidate !== "mixed" && isModeAvailable(candidate, rangeLength),
    );
    mode = sample(available);
  } else {
    mode = selectedMode;
  }

  const positions = Array.from({ length: rangeLength }, (_, i) => start + i);

  if (mode === "card-position") {
    const position = sample(positions);
    return {
      mode,
      promptCard: stack[position - 1],
      steps: [positionStep("¿En qué posición está?", position, start, end)],
    };
  }

  if (mode === "position-card") {
    const position = sample(positions);
    return {
      mode,
      promptPosition: position,
      steps: [cardStep("¿Qué carta va aquí?", position, start, end)],
    };
  }

  if (mode === "previous" || mode === "next") {
    const anchorPositions = mode === "previous" ? positions.slice(1) : positions.slice(0, -1);
    const anchor = sample(anchorPositions);
    const answerPosition = mode === "previous" ? anchor - 1 : anchor + 1;
    return {
      mode,
      promptCard: stack[anchor - 1],
      steps: [
        cardStep(
          mode === "previous" ? "¿Qué carta va justo antes?" : "¿Qué carta va justo después?",
          answerPosition,
          start,
          end,
        ),
      ],
    };
  }

  if (mode === "offset") {
    const maxDistance = Math.min(5, rangeLength - 1);
    const pairs: Array<{ anchor: number; answer: number; distance: number }> = [];
    for (let distance = 1; distance <= maxDistance; distance += 1) {
      for (let anchor = start; anchor <= end; anchor += 1) {
        if (anchor + distance <= end) pairs.push({ anchor, answer: anchor + distance, distance });
        if (anchor - distance >= start) pairs.push({ anchor, answer: anchor - distance, distance: -distance });
      }
    }
    const pair = sample(pairs);
    const direction = pair.distance > 0 ? "después" : "antes";
    const amount = Math.abs(pair.distance);
    return {
      mode,
      promptCard: stack[pair.anchor - 1],
      helper: `${amount} ${amount === 1 ? "posición" : "posiciones"} ${direction}`,
      steps: [cardStep(`¿Qué carta está ${amount} ${direction}?`, pair.answer, start, end)],
    };
  }

  if (mode === "neighborhood") {
    const anchor = sample(positions.slice(1, -1));
    return {
      mode,
      promptCard: stack[anchor - 1],
      helper: "Completa las tres relaciones",
      steps: [
        cardStep("1 · Carta anterior", anchor - 1, start, end),
        positionStep("2 · Posición", anchor, start, end),
        cardStep("3 · Carta siguiente", anchor + 1, start, end),
      ],
    };
  }

  const directions = [
    ...(rangeLength >= 4 ? [1] : []),
    ...(rangeLength >= 4 ? [-1] : []),
  ];
  const direction = sample(directions);
  const anchors = direction === 1 ? positions.slice(0, -3) : positions.slice(3);
  const anchor = sample(anchors);
  return {
    mode,
    promptCard: stack[anchor - 1],
    helper: direction === 1 ? "Continúa hacia delante" : "Continúa hacia atrás",
    steps: [1, 2, 3].map((step) =>
      cardStep(
        `${step}ª carta ${direction === 1 ? "siguiente" : "anterior"}`,
        anchor + direction * step,
        start,
        end,
      ),
    ),
  };
}

function makeReviewQuestion(
  focusPositions: number[],
  start: number,
  end: number,
  preferredMode: "card-position" | "position-card" | null = null,
): Question {
  const available = focusPositions.filter((position) => position >= start && position <= end);
  const position = sample(available.length ? available : [start]);
  const chosenMode = preferredMode && Math.random() < 0.7
    ? preferredMode
    : Math.random() < 0.5 ? "card-position" : "position-card";
  if (chosenMode === "card-position") {
    return {
      mode: "card-position",
      promptCard: stack[position - 1],
      helper: "Repaso de una relación débil",
      steps: [positionStep("¿En qué posición está?", position, start, end)],
    };
  }
  return {
    mode: "position-card",
    promptPosition: position,
    helper: "Repaso de una relación débil",
    steps: [cardStep("¿Qué carta va aquí?", position, start, end)],
  };
}

function CardFace({ card, compact = false }: { card: PlayingCard; compact?: boolean }) {
  return (
    <div
      className={`playing-card ${compact ? "playing-card--compact" : ""}`}
      aria-label={card.label}
    >
      <img className="playing-card__image" src={card.image} alt={card.label} draggable={false} />
    </div>
  );
}

function RangePicker({
  start,
  end,
  onStart,
  onEnd,
}: {
  start: number;
  end: number;
  onStart: (value: number) => void;
  onEnd: (value: number) => void;
}) {
  const positions = Array.from({ length: 52 }, (_, i) => i + 1);
  return (
    <div className="range-picker">
      <div>
        <label>Desde</label>
        <Select value={String(start)} onValueChange={(value) => onStart(Math.min(Number(value), end))}>
          <SelectTrigger aria-label="Primera posición" className="range-select"><SelectValue /></SelectTrigger>
          <SelectContent>
            {positions.map((position) => <SelectItem key={position} value={String(position)}>{position}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <span className="range-picker__line" />
      <div>
        <label>Hasta</label>
        <Select value={String(end)} onValueChange={(value) => onEnd(Math.max(Number(value), start))}>
          <SelectTrigger aria-label="Última posición" className="range-select"><SelectValue /></SelectTrigger>
          <SelectContent>
            {positions.map((position) => <SelectItem key={position} value={String(position)}>{position}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function ModeIcon({ mode }: { mode: Mode }) {
  if (mode === "mixed") return <Shuffle />;
  if (mode === "card-position") return <Layers3 />;
  if (mode === "position-card") return <Target />;
  if (mode === "offset") return <MoveHorizontal />;
  if (mode === "sequence") return <ListOrdered />;
  if (mode === "neighborhood") return <GitCompareArrows />;
  return <Brain />;
}

export function TrainerApp() {
  const [view, setView] = useState<View>("home");
  const [start, setStart] = useState(1);
  const [end, setEnd] = useState(10);
  const [mode, setMode] = useState<Mode>("mixed");
  const [answerStyle, setAnswerStyle] = useState<AnswerStyle>("choices");
  const [sessionLength, setSessionLength] = useState<SessionLength>(10);
  const [concealChoices, setConcealChoices] = useState(true);
  const [choicesRevealed, setChoicesRevealed] = useState(false);
  const [question, setQuestion] = useState<Question | null>(null);
  const [questionNumber, setQuestionNumber] = useState(1);
  const [stepIndex, setStepIndex] = useState(0);
  const [questionHadError, setQuestionHadError] = useState(false);
  const [score, setScore] = useState(0);
  const [finalScore, setFinalScore] = useState(0);
  const [finalTotal, setFinalTotal] = useState(0);
  const [answerTimes, setAnswerTimes] = useState<number[]>([]);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string | number | null>(null);
  const [directNumber, setDirectNumber] = useState("");
  const [directRank, setDirectRank] = useState("");
  const [directSuit, setDirectSuit] = useState("");
  const [sessionState, setSessionState] = useState<"idle" | "training" | "summary">("idle");
  const [progress, setProgress] = useState<ProgressSnapshot | null>(null);
  const [syncState, setSyncState] = useState<"loading" | "online" | "pending" | "unconfigured">("loading");
  const [sessionSyncState, setSessionSyncState] = useState<"idle" | "saving" | "saved" | "pending">("idle");
  const [pendingCount, setPendingCount] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [themePreference, setThemePreference] = useState<ThemePreference>("system");
  const [themeReady, setThemeReady] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [learnPosition, setLearnPosition] = useState(1);
  const [learnRevealed, setLearnRevealed] = useState(true);
  const [sessionLabel, setSessionLabel] = useState<string | null>(null);
  const [backendEmail, setBackendEmail] = useState("");
  const [backendName, setBackendName] = useState("");
  const [backendSecret, setBackendSecret] = useState("");
  const [backendMessage, setBackendMessage] = useState("");
  const [backendConfigured, setBackendConfigured] = useState(false);
  const reviewPositions = useRef<number[] | null>(null);
  const reviewMode = useRef<"card-position" | "position-card" | null>(null);
  const stepStartedAt = useRef(0);
  const questionRecallMs = useRef(0);
  const stepRecallCaptured = useRef(false);
  const sessionId = useRef("");
  const sessionStartedAt = useRef("");
  const sessionAnswers = useRef<AnswerRecord[]>([]);
  const cachedProgressRef = useRef<ProgressSnapshot | null>(null);

  const rangeLength = end - start + 1;
  const activeMode = isModeAvailable(mode, rangeLength) ? mode : "card-position";
  const questionGoal = sessionLength === "continuous" ? null : sessionLength;
  const suggested = guidedRange(progress);

  const averageTime = useMemo(() => {
    if (!answerTimes.length) return 0;
    return answerTimes.reduce((total, time) => total + time, 0) / answerTimes.length;
  }, [answerTimes]);

  useEffect(() => {
    const storedTheme = window.localStorage.getItem(THEME_PREFERENCE_KEY);
    if (storedTheme === "system" || storedTheme === "light" || storedTheme === "dark") {
      setThemePreference(storedTheme);
    }
    setThemeReady(true);

    const storedPreferences = window.localStorage.getItem(PREFERENCES_KEY);
    let hasStoredPreferences = false;
    if (storedPreferences) {
      try {
        const saved = JSON.parse(storedPreferences) as Partial<LocalPreferences>;
        if (typeof saved.start === "number") setStart(Math.max(1, Math.min(52, saved.start)));
        if (typeof saved.end === "number") setEnd(Math.max(1, Math.min(52, saved.end)));
        if (saved.mode && allModes.includes(saved.mode)) setMode(saved.mode);
        if (saved.answerStyle === "choices" || saved.answerStyle === "direct") setAnswerStyle(saved.answerStyle);
        if (saved.sessionLength && SESSION_LENGTHS.includes(saved.sessionLength)) setSessionLength(saved.sessionLength);
        if (typeof saved.concealChoices === "boolean") setConcealChoices(saved.concealChoices);
        hasStoredPreferences = true;
      } catch {
        window.localStorage.removeItem(PREFERENCES_KEY);
      }
    }

    const cachedProgress = window.localStorage.getItem(LOCAL_PROGRESS_KEY);
    if (cachedProgress) {
      try {
        const snapshot = JSON.parse(cachedProgress) as ProgressSnapshot;
        cachedProgressRef.current = snapshot;
        setProgress(snapshot);
      } catch {
        window.localStorage.removeItem(LOCAL_PROGRESS_KEY);
      }
    }

    setPendingCount(readPendingSessions().length);
    const backend = readBackendConfig();
    if (backend) {
      setBackendConfigured(true);
      setBackendEmail(backend.email);
      setBackendName(backend.name);
      setBackendSecret(backend.secret);
    } else {
      setSyncState("unconfigured");
    }
    setIsOnline(navigator.onLine);
    setPreferencesReady(true);

    const handleOnline = () => {
      setIsOnline(true);
      void flushPendingSessions();
    };
    const handleOffline = () => setIsOnline(false);
    const handleInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("beforeinstallprompt", handleInstall);
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register(`${PUBLIC_BASE_PATH}/sw.js`);
    }

    void (async () => {
      await restoreProgress(hasStoredPreferences);
      await flushPendingSessions();
    })();

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("beforeinstallprompt", handleInstall);
    };
  }, []);

  useEffect(() => {
    if (!themeReady) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const resolvedTheme = themePreference === "system"
        ? (media.matches ? "dark" : "light")
        : themePreference;
      document.documentElement.dataset.theme = resolvedTheme;
      document.documentElement.style.colorScheme = resolvedTheme;
      document.querySelector('meta[name="theme-color"]')?.setAttribute(
        "content",
        resolvedTheme === "dark" ? "#07131b" : "#f7f9f9",
      );
    };

    window.localStorage.setItem(THEME_PREFERENCE_KEY, themePreference);
    applyTheme();
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [themePreference, themeReady]);

  useEffect(() => {
    if (!preferencesReady) return;
    const preferences: LocalPreferences = {
      start, end, mode, answerStyle, sessionLength, concealChoices,
    };
    window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
  }, [answerStyle, concealChoices, end, mode, preferencesReady, sessionLength, start]);

  function cacheProgress(snapshot: ProgressSnapshot) {
    window.localStorage.setItem(LOCAL_PROGRESS_KEY, JSON.stringify(snapshot));
    cachedProgressRef.current = snapshot;
    setProgress(snapshot);
  }

  async function restoreProgress(preserveLocalRange = true) {
    if (!readBackendConfig()) {
      setSyncState("unconfigured");
      return false;
    }
    try {
      const remoteProgress = await getRemoteProgress<ProgressSnapshot>();
      if (!remoteProgress.modes && cachedProgressRef.current?.modes) {
        remoteProgress.modes = cachedProgressRef.current.modes;
      }
      const reconciled = readPendingSessions().reduce(
        (snapshot, payload) => applySessionLocally(snapshot, payload),
        remoteProgress,
      );
      cacheProgress(reconciled);
      if (!preserveLocalRange) {
        setStart(remoteProgress.range_start);
        setEnd(remoteProgress.range_end);
      }
      setSyncState("online");
      return true;
    } catch {
      setSyncState("pending");
      return false;
    }
  }

  function readPendingSessions(): SessionPayload[] {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(PENDING_SESSIONS_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function queueSession(payload: SessionPayload) {
    const pending = readPendingSessions();
    if (!pending.some((item) => item.session.session_id === payload.session.session_id)) {
      const next = [...pending, payload];
      window.localStorage.setItem(PENDING_SESSIONS_KEY, JSON.stringify(next));
      setPendingCount(next.length);
    }
    setSyncState("pending");
  }

  function removePendingSession(sessionIdToRemove: string) {
    const pending = readPendingSessions().filter(
      (item) => item.session.session_id !== sessionIdToRemove,
    );
    window.localStorage.setItem(PENDING_SESSIONS_KEY, JSON.stringify(pending));
    setPendingCount(pending.length);
  }

  async function sendSession(payload: SessionPayload, localFallback?: ProgressSnapshot) {
    const remoteProgress = await saveRemoteSession<ProgressSnapshot>(payload);
    if (remoteProgress) {
      if (!remoteProgress.modes && localFallback?.modes) remoteProgress.modes = localFallback.modes;
      else if (!remoteProgress.modes && cachedProgressRef.current?.modes) remoteProgress.modes = cachedProgressRef.current.modes;
      const remaining = readPendingSessions().filter(
        (item) => item.session.session_id !== payload.session.session_id,
      );
      const reconciled = remaining.reduce(
        (snapshot, pendingPayload) => applySessionLocally(snapshot, pendingPayload),
        remoteProgress,
      );
      cacheProgress(reconciled);
      setSyncState(remaining.length ? "pending" : "online");
    }
  }

  function persistSession(payload: SessionPayload) {
    queueSession(payload);
    const localProgress = applySessionLocally(progress, payload);
    cacheProgress(localProgress);
    setSessionSyncState("saving");
    void (async () => {
      try {
        await sendSession(payload, localProgress);
        removePendingSession(payload.session.session_id);
        setSessionSyncState("saved");
      } catch {
        setSessionSyncState("pending");
      }
    })();
  }

  async function flushPendingSessions() {
    if (!readBackendConfig()) {
      setSyncState("unconfigured");
      return;
    }
    const pending = readPendingSessions();
    if (!pending.length) return;

    const remaining: SessionPayload[] = [];
    for (const payload of pending) {
      try {
        await sendSession(payload);
        removePendingSession(payload.session.session_id);
      } catch {
        remaining.push(payload);
      }
    }
    window.localStorage.setItem(PENDING_SESSIONS_KEY, JSON.stringify(remaining));
    setPendingCount(remaining.length);
    if (remaining.length) setSyncState("pending");
  }

  function resetStepAnswer() {
    setFeedback(null);
    setSelectedAnswer(null);
    setDirectNumber("");
    setDirectRank("");
    setDirectSuit("");
    setChoicesRevealed(answerStyle === "direct" || !concealChoices);
    stepStartedAt.current = performance.now();
    stepRecallCaptured.current = false;
  }

  function resetQuestionAnswer() {
    questionRecallMs.current = 0;
    resetStepAnswer();
  }

  function captureStepRecall() {
    if (stepRecallCaptured.current) return;
    questionRecallMs.current += performance.now() - stepStartedAt.current;
    stepRecallCaptured.current = true;
  }

  function revealChoices() {
    captureStepRecall();
    setChoicesRevealed(true);
  }

  function begin(chosenMode = activeMode, label: string | null = null, focusPositions: number[] | null = null) {
    const safeMode = isModeAvailable(chosenMode, rangeLength) ? chosenMode : "card-position";
    setMode(safeMode);
    setSessionLabel(label);
    reviewPositions.current = focusPositions;
    setQuestion(focusPositions?.length
      ? makeReviewQuestion(focusPositions, start, end, reviewMode.current)
      : makeQuestion(safeMode, start, end));
    setQuestionNumber(1);
    setStepIndex(0);
    setQuestionHadError(false);
    setScore(0);
    setFinalScore(0);
    setSessionSyncState("idle");
    setAnswerTimes([]);
    sessionId.current = crypto.randomUUID();
    sessionStartedAt.current = new Date().toISOString();
    sessionAnswers.current = [];
    resetQuestionAnswer();
    setSessionState("training");
  }

  function beginLearning(rangeStart = start, rangeEnd = end, firstPosition = rangeStart) {
    setStart(rangeStart);
    setEnd(rangeEnd);
    setLearnPosition(firstPosition);
    setLearnRevealed(true);
    setView("learn");
  }

  function beginGuidedLearning() {
    beginLearning(suggested.start, suggested.end, suggested.firstToStrengthen);
  }

  function beginReview() {
    const weakest = (progress?.cards ?? emptyProgress(start, end).cards)
      .filter((card) => card.position >= start && card.position <= end)
      .sort((a, b) => (b.review_priority ?? reviewPriority(b)) - (a.review_priority ?? reviewPriority(a)))
      .slice(0, 12)
      .map((card) => card.position);
    const directionalModes = (progress?.modes ?? []).filter(
      (item): item is ModeProgress & { mode: "card-position" | "position-card" } =>
        item.mode === "card-position" || item.mode === "position-card",
    );
    reviewMode.current = directionalModes.length
      ? [...directionalModes].sort((a, b) => a.accuracy - b.accuracy || b.average_time_ms - a.average_time_ms)[0].mode
      : null;
    const fallback = Array.from({ length: rangeLength }, (_, index) => start + index);
    begin("mixed", "Puntos débiles", weakest.length ? weakest : fallback);
  }

  function finishSession(finalScoreValue = score, finalTimes = answerTimes) {
    const completedAnswers = sessionAnswers.current.length;
    if (!completedAnswers) {
      setSessionState("idle");
      return;
    }
    const averageMs = Math.round(
      (finalTimes.reduce((total, time) => total + time, 0) / Math.max(1, finalTimes.length)) * 1000,
    );
    const payload: SessionPayload = {
      session: {
        session_id: sessionId.current,
        started_at: sessionStartedAt.current,
        ended_at: new Date().toISOString(),
        mode,
        answer_style: answerStyle,
        range_start: start,
        range_end: end,
        total_questions: completedAnswers,
        correct_questions: finalScoreValue,
        average_time_ms: averageMs,
        client_version: "web-3",
      },
      answers: [...sessionAnswers.current],
      settings: { range_start: start, range_end: end, mode, answer_style: answerStyle },
    };
    setFinalScore(finalScoreValue);
    setFinalTotal(completedAnswers);
    setSessionState("summary");
    persistSession(payload);
  }

  function answer(value: string | number, isCorrect: boolean) {
    if (feedback || !question) return;
    captureStepRecall();
    const isLastStep = stepIndex === question.steps.length - 1;
    const failedSoFar = questionHadError || !isCorrect;
    setSelectedAnswer(value);
    setFeedback(isCorrect ? "correct" : "wrong");
    setQuestionHadError(failedSoFar);

    window.setTimeout(() => {
      if (!isLastStep) {
        setStepIndex((current) => current + 1);
        resetStepAnswer();
        return;
      }

      const elapsed = Math.max(0.05, questionRecallMs.current / 1000);
      const nextTimes = [...answerTimes, elapsed];
      const nextScore = score + (failedSoFar ? 0 : 1);
      const cardPosition = question.promptPosition ?? (
        question.promptCard ? stack.findIndex((card) => card.label === question.promptCard?.label) + 1 : 0
      );
      sessionAnswers.current.push({
        answer_id: crypto.randomUUID(),
        answered_at: new Date().toISOString(),
        mode: question.mode,
        card_position: cardPosition,
        card_code: cardPosition > 0 ? MNEMONICA[cardPosition - 1] : "",
        correct: !failedSoFar,
        response_time_ms: Math.round(elapsed * 1000),
        range_start: start,
        range_end: end,
        answer_style: answerStyle,
        outcome: value === "__unknown__" ? "unknown" : "answered",
      });
      setAnswerTimes(nextTimes);
      setScore(nextScore);

      if (questionGoal && questionNumber >= questionGoal) {
        finishSession(nextScore, nextTimes);
        return;
      }

      setQuestionNumber((current) => current + 1);
      setQuestion(reviewPositions.current?.length
        ? makeReviewQuestion(reviewPositions.current, start, end, reviewMode.current)
        : makeQuestion(mode, start, end));
      setStepIndex(0);
      setQuestionHadError(false);
      resetQuestionAnswer();
    }, 700);
  }

  function dontKnow() {
    setChoicesRevealed(true);
    answer("__unknown__", false);
  }

  async function installApp() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
    if (navigator.storage?.persist) void navigator.storage.persist();
  }

  async function connectBackend() {
    const email = backendEmail.trim().toLowerCase();
    const secret = backendSecret.trim();
    if (!email.includes("@") || !secret) {
      setBackendMessage("Escribe tu correo y la clave de acceso.");
      return;
    }
    saveBackendConfig({ email, secret, name: backendName.trim() || email });
    setBackendConfigured(true);
    setBackendMessage("Comprobando conexión…");
    setSyncState("loading");
    try {
      const connected = await restoreProgress(false);
      if (!connected) throw new Error();
      await flushPendingSessions();
      setBackendMessage("Conectado con tu hoja privada.");
    } catch {
      setSyncState("pending");
      setBackendMessage("No se ha podido conectar. Revisa la clave y la versión de Apps Script.");
    }
  }

  function disconnectBackend() {
    removeBackendConfig();
    setBackendConfigured(false);
    setBackendSecret("");
    setBackendMessage("La clave se ha eliminado de este dispositivo.");
    setSyncState("unconfigured");
  }

  function submitDirect(step: AnswerStep) {
    if (step.kind === "position") {
      if (!directNumber) return;
      answer(Number(directNumber), Number(directNumber) === step.correctPosition);
      return;
    }

    if (!directRank || !directSuit) return;
    const chosenCard = stack.find((card) => card.rank === directRank && card.suit === directSuit);
    if (!chosenCard) return;
    answer(chosenCard.label, chosenCard.label === step.correctCard?.label);
  }

  if (sessionState === "training" && question) {
    const step = question.steps[stepIndex];
    const correctText = step.kind === "position"
      ? `Era ${step.correctPosition}`
      : `Era ${step.correctCard?.label}`;

    return (
      <main className="trainer-screen">
        <div className="trainer-shell">
          <header className="trainer-header">
            <button
              className="icon-button"
              onClick={() => sessionAnswers.current.length ? finishSession() : setSessionState("idle")}
              aria-label={sessionAnswers.current.length ? "Terminar y guardar la sesión" : "Salir del entrenamiento"}
            ><ArrowLeft /></button>
            <div className="trainer-header__progress">
              <span>{sessionLabel ?? modeInfo[mode].short} · {answerStyle === "direct" ? "sin opciones" : "con opciones"}</span>
              <Progress value={questionGoal ? (questionNumber / questionGoal) * 100 : 100} className={questionGoal ? "" : "continuous-progress"} />
            </div>
            {questionGoal ? (
              <span className="question-count">{questionNumber}/{questionGoal}</span>
            ) : (
              <button
                className="question-count question-count--stop"
                disabled={!sessionAnswers.current.length || Boolean(feedback)}
                onClick={() => finishSession()}
              >Terminar</button>
            )}
          </header>

          <section className="question-stage">
            <div className="question-prompt">
              {question.promptCard ? (
                <CardFace card={question.promptCard} />
              ) : (
                <div className="position-orb" aria-label={`Posición ${question.promptPosition}`}>
                  <span>posición</span><strong>{question.promptPosition}</strong>
                </div>
              )}
            </div>

            {question.helper && <p className="question-helper">{question.helper}</p>}
            {question.steps.length > 1 && (
              <div className="step-dots" aria-label={`Paso ${stepIndex + 1} de ${question.steps.length}`}>
                {question.steps.map((_, index) => <i key={index} className={index <= stepIndex ? "active" : ""} />)}
              </div>
            )}
            <h1>{step.prompt}</h1>

            {answerStyle === "direct" ? (
              <form
                className="direct-answer"
                onSubmit={(event) => {
                  event.preventDefault();
                  submitDirect(step);
                }}
              >
                {step.kind === "position" ? (
                  <input
                    type="number"
                    inputMode="numeric"
                    min={start}
                    max={end}
                    value={directNumber}
                    onChange={(event) => setDirectNumber(event.target.value)}
                    placeholder={`${start}–${end}`}
                    aria-label="Escribe la posición"
                    autoFocus
                  />
                ) : (
                  <div className="card-picker">
                    <Select value={directRank} onValueChange={setDirectRank}>
                      <SelectTrigger aria-label="Valor de la carta" className="direct-select"><SelectValue placeholder="Valor" /></SelectTrigger>
                      <SelectContent>
                        {rankChoices.map((rank) => <SelectItem key={rank} value={rank}>{rank}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={directSuit} onValueChange={setDirectSuit}>
                      <SelectTrigger aria-label="Palo de la carta" className="direct-select"><SelectValue placeholder="Palo" /></SelectTrigger>
                      <SelectContent>
                        {Object.values(suitData).map((data) => (
                          <SelectItem key={data.suit} value={data.suit}>{data.symbol} {data.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <Button
                  type="submit"
                  size="lg"
                  className="check-answer"
                  disabled={step.kind === "position" ? !directNumber : !directRank || !directSuit}
                >
                  Comprobar
                </Button>
                <button type="button" className="unknown-answer" onClick={dontKnow}>No la sé</button>
              </form>
            ) : (
              <div className={`choice-reveal ${choicesRevealed ? "choice-reveal--open" : ""}`}>
                <div className="choice-reveal__content" aria-hidden={!choicesRevealed}>
                  {step.positionOptions ? (
                    <div className="number-options">
                      {step.positionOptions.map((position) => {
                        const isCorrect = position === step.correctPosition;
                        const selected = selectedAnswer === position;
                        return (
                          <Button
                            key={position}
                            className={`number-option ${feedback && isCorrect ? "answer-correct" : ""} ${feedback === "wrong" && selected ? "answer-wrong" : ""}`}
                            variant="outline"
                            tabIndex={choicesRevealed ? 0 : -1}
                            onClick={() => answer(position, isCorrect)}
                          >
                            {position}
                          </Button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="card-options">
                      {step.cardOptions?.map((card) => {
                        const isCorrect = card.label === step.correctCard?.label;
                        const selected = selectedAnswer === card.label;
                        return (
                          <button
                            key={card.label}
                            className={`card-option ${feedback && isCorrect ? "answer-correct" : ""} ${feedback === "wrong" && selected ? "answer-wrong" : ""}`}
                            onClick={() => answer(card.label, isCorrect)}
                            tabIndex={choicesRevealed ? 0 : -1}
                            aria-label={card.label}
                          >
                            <CardFace card={card} compact />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                {!choicesRevealed && (
                  <button className="choice-reveal__cover" onClick={revealChoices}>
                    <Eye />
                    <strong>Piensa la respuesta</strong>
                    <span>Toca para ver las opciones</span>
                  </button>
                )}
                <button className="unknown-answer" onClick={dontKnow} disabled={Boolean(feedback)}>No la sé</button>
              </div>
            )}

            <div className={`feedback ${feedback ? "feedback--visible" : ""}`}>
              {feedback === "correct" ? (
                <><CircleCheck /> Correcto</>
              ) : feedback === "wrong" ? (
                <><CircleX /> {correctText}</>
              ) : <span>&nbsp;</span>}
            </div>
          </section>
        </div>
      </main>
    );
  }

  if (sessionState === "summary") {
    return (
      <main className="summary-screen">
        <section className="summary-card">
          <div className="summary-icon"><Sparkles /></div>
          <p className="eyebrow">Sesión terminada</p>
          <h1>{finalScore} de {finalTotal}</h1>
          <p className="summary-copy">
            {finalScore >= 9 ? "Este bloque empieza a salir automático." : finalScore >= 7 ? "Buen avance. Otra vuelta asentará las dudas." : "Perfecto para detectar qué cartas necesitan otra pasada."}
          </p>
          <div className="summary-stats">
            <div><strong>{Math.round((finalScore / Math.max(1, finalTotal)) * 100)}%</strong><span>aciertos</span></div>
            <div><strong>{averageTime.toFixed(1)} s</strong><span>respuesta media</span></div>
          </div>
          <div className={`session-sync session-sync--${sessionSyncState}`} role="status" aria-live="polite">
            {sessionSyncState === "saved" ? (
              <><CircleCheck /><span><strong>Progreso guardado</strong><small>Todo está al día.</small></span></>
            ) : sessionSyncState === "pending" ? (
              <><CloudOff /><span><strong>Guardado en este dispositivo</strong><small>Se sincronizará cuando vuelva la conexión.</small></span></>
            ) : (
              <><Cloud className="sync-spinner" /><span><strong>Progreso guardado</strong><small>Sincronizando en segundo plano.</small></span></>
            )}
          </div>
          <Button
            size="lg"
            className="primary-action"
            onClick={() => begin(mode, sessionLabel, reviewPositions.current)}
          ><RotateCcw /> Repetir sesión</Button>
          <Button variant="ghost" size="lg" onClick={() => setSessionState("idle")}>Volver al inicio</Button>
        </section>
      </main>
    );
  }

  if (view === "learn") {
    const learnedCard = stack[learnPosition - 1];
    return (
      <main className="trainer-screen learn-screen">
        <div className="trainer-shell">
          <header className="trainer-header">
            <button className="icon-button" onClick={() => setView("home")} aria-label="Volver al inicio"><ArrowLeft /></button>
            <div className="trainer-header__progress">
              <span>Aprender · posiciones {start}–{end}</span>
              <Progress value={((learnPosition - start + 1) / rangeLength) * 100} />
            </div>
            <span className="question-count">{learnPosition - start + 1}/{rangeLength}</span>
          </header>

          <section className="learn-stage">
            <div className="learn-position"><span>posición</span><strong>{learnPosition}</strong></div>
            <div className={`learn-card ${learnRevealed ? "is-revealed" : ""}`}>
              {learnRevealed ? (
                <CardFace card={learnedCard} />
              ) : (
                <button onClick={() => setLearnRevealed(true)} aria-label="Mostrar la carta">
                  <Eye /><span>¿Qué carta va aquí?</span><small>Toca para comprobar</small>
                </button>
              )}
            </div>
            <h1>{learnRevealed ? learnedCard.label : "Recuérdala antes de mirar"}</h1>
            <Button
              variant="outline"
              size="lg"
              className="reveal-action"
              onClick={() => setLearnRevealed((current) => !current)}
            >
              {learnRevealed ? <><EyeOff /> Ocultar para recordar</> : <><Eye /> Mostrar carta</>}
            </Button>
            <div className="learn-navigation">
              <Button
                variant="ghost"
                disabled={learnPosition <= start}
                onClick={() => { setLearnPosition((position) => position - 1); setLearnRevealed(true); }}
              >
                <ArrowLeft /> Anterior
              </Button>
              <Button
                disabled={learnPosition >= end}
                onClick={() => { setLearnPosition((position) => position + 1); setLearnRevealed(true); }}
              >
                Siguiente <ChevronRight />
              </Button>
            </div>
          </section>
        </div>
      </main>
    );
  }

  const quickModes: Mode[] = ["mixed", "card-position", "offset", "sequence"];
  const progressCards = progress?.cards ?? Array.from({ length: 52 }, (_, index) => ({
    position: index + 1,
    total: 0,
    accuracy: 0,
    average_time_ms: 0,
    recent_accuracy: 0,
    recent_average_time_ms: 0,
    recent_attempts: [],
    status: "unseen" as const,
  }));
  const strongCards = progressCards.filter((card) => card.status === "strong").length;
  const learningCards = progressCards.filter((card) => card.status === "learning").length;
  const progressModes = (progress?.modes ?? []).filter((item) => item.total > 0);
  const sessionLengthCopy = sessionLengthLabel(sessionLength);

  return (
    <main className="app-screen">
      <div className="app-shell">
        <header className="topbar">
          <div><p className="eyebrow">Ordenación</p><h1>Mnemónica</h1></div>
          <button className="avatar-button" aria-label="Ajustes" onClick={() => setView("settings")}><span>IU</span><Settings2 /></button>
        </header>

        {view === "home" && (
          <div className="view-content">
            <section className="hero-practice">
              <div className="hero-practice__copy">
                <span className="range-badge">Posiciones {start}–{end}</span>
                <h2>Una vuelta rápida</h2>
                <p>{sessionLengthCopy} · {modeInfo[activeMode].short.toLowerCase()}.</p>
                <Button size="lg" className="hero-button" onClick={() => begin(activeMode)}><Play fill="currentColor" /> Empezar</Button>
              </div>
              <div className="card-fan" aria-hidden="true">
                <div className="fan-card fan-card--left"><CardFace card={stack[start - 1]} compact /></div>
                <div className="fan-card fan-card--right"><CardFace card={stack[Math.min(end - 1, 51)]} compact /></div>
              </div>
            </section>

            <section className="home-section learning-shortcuts" aria-label="Aprendizaje y repaso">
              <button className="guided-learning" onClick={beginGuidedLearning}>
                <span className="mode-icon"><Sparkles /></span>
                <span><strong>Ruta guiada · 1–{suggested.end}</strong><small>Siguiente posición por afianzar: {suggested.firstToStrengthen}.</small></span>
                <ChevronRight />
              </button>
              <button onClick={() => beginLearning()}>
                <span className="mode-icon"><BookOpen /></span>
                <span><strong>Aprender</strong><small>Recorre el bloque carta a carta.</small></span>
                <ChevronRight />
              </button>
              <button onClick={beginReview}>
                <span className="mode-icon"><RefreshCcw /></span>
                <span><strong>Repasar débiles</strong><small>{progress ? "Prioriza tus relaciones menos seguras." : "Empieza con el bloque actual."}</small></span>
                <ChevronRight />
              </button>
            </section>

            <section className="home-section">
              <div className="section-heading">
                <div><p className="eyebrow">Tu bloque actual</p><h2>{rangeLength} cartas</h2></div>
                <button onClick={() => setView("practice")}>Cambiar <ChevronRight /></button>
              </div>
              <div className="stack-strip">
                {Array.from({ length: Math.min(rangeLength, 10) }, (_, i) => start + i).map((position) => (
                  <span key={position} className={position <= start + 2 ? "learned" : ""}>{position}</span>
                ))}
              </div>
              <p className="subtle-copy">Primero precisión; la velocidad vendrá después.</p>
            </section>

            <section className="home-section">
              <div className="section-heading">
                <div><p className="eyebrow">Modos</p><h2>Entrenamiento</h2></div>
                <button onClick={() => setView("practice")}>Ver todos <ChevronRight /></button>
              </div>
              <div className="quick-modes">
                {quickModes.map((modeKey) => (
                  <button
                    key={modeKey}
                    disabled={!isModeAvailable(modeKey, rangeLength)}
                    onClick={() => begin(modeKey)}
                  >
                    <span className="mode-icon"><ModeIcon mode={modeKey} /></span>
                    <strong>{modeInfo[modeKey].short}</strong><small>{modeInfo[modeKey].description}</small>
                  </button>
                ))}
              </div>
            </section>
          </div>
        )}

        {view === "practice" && (
          <div className="view-content">
            <section className="page-intro"><p className="eyebrow">Entrenar</p><h2>Prepara tu sesión</h2><p>Preguntas y respuestas se adaptan al rango elegido.</p></section>

            <section className="settings-card">
              <div className="setting-title"><span>01</span><h3>Rango de estudio</h3></div>
              <RangePicker start={start} end={end} onStart={setStart} onEnd={setEnd} />
              <div className="range-summary"><strong>{rangeLength}</strong><span>{rangeLength === 1 ? "carta seleccionada" : "cartas seleccionadas"}</span></div>
            </section>

            <section className="settings-card">
              <div className="setting-title"><span>02</span><h3>Tipo de pregunta</h3></div>
              <div className="mode-list">
                {allModes.map((modeKey) => (
                  <button
                    key={modeKey}
                    className={mode === modeKey ? "selected" : ""}
                    disabled={!isModeAvailable(modeKey, rangeLength)}
                    onClick={() => setMode(modeKey)}
                  >
                    <span className="radio-dot" />
                    <div><strong>{modeInfo[modeKey].title}</strong><small>{modeInfo[modeKey].description}</small></div>
                  </button>
                ))}
              </div>
            </section>

            <section className="settings-card">
              <div className="setting-title"><span>03</span><h3>Forma de responder</h3></div>
              <RadioGroup
                className="answer-style-options"
                value={answerStyle}
                onValueChange={(value) => setAnswerStyle(value as AnswerStyle)}
              >
                <label className={answerStyle === "choices" ? "selected" : ""}>
                  <RadioGroupItem value="choices" />
                  <span><strong>Con opciones</strong><small>Más ágil para aprender bloques nuevos.</small></span>
                </label>
                <label className={answerStyle === "direct" ? "selected" : ""}>
                  <RadioGroupItem value="direct" />
                  <span><strong>Sin opciones</strong><small>Escribes el número o eliges valor y palo.</small></span>
                </label>
              </RadioGroup>
              {answerStyle === "choices" && (
                <label className="thinking-setting">
                  <span><strong>Pensar antes de verlas</strong><small>Las opciones permanecen difuminadas hasta que toques.</small></span>
                  <Switch checked={concealChoices} onCheckedChange={setConcealChoices} aria-label="Ocultar las opciones al principio" />
                </label>
              )}
            </section>

            <section className="settings-card">
              <div className="setting-title"><span>04</span><h3>Duración</h3></div>
              <div className="duration-options">
                {SESSION_LENGTHS.map((length) => (
                  <button
                    key={String(length)}
                    className={sessionLength === length ? "selected" : ""}
                    onClick={() => setSessionLength(length)}
                  >{length === "continuous" ? "Continua" : length}</button>
                ))}
              </div>
              <p className="duration-copy">{sessionLength === "continuous" ? "Entrena hasta que pulses Terminar." : `La sesión terminará después de ${sessionLength} preguntas.`}</p>
            </section>

            <Button size="lg" className="primary-action sticky-start" onClick={() => begin(activeMode)}>Empezar · {sessionLengthCopy} <ChevronRight /></Button>
          </div>
        )}

        {view === "progress" && (
          <div className="view-content">
            <section className="page-intro">
              <p className="eyebrow">Progreso</p>
              <h2>Tu baraja, de un vistazo</h2>
              <p>{syncState === "online" ? "Datos sincronizados con tu hoja privada." : syncState === "loading" ? "Cargando tu progreso…" : syncState === "unconfigured" ? "El progreso se guarda aquí; conecta Sheets para sincronizarlo." : "Hay datos pendientes de sincronizar."}</p>
            </section>
            <section className="progress-overview">
              <div className="progress-ring"><strong>{progress?.mastery_percent ?? 0}%</strong><span>dominio</span></div>
              <div>
                <p>Rango actual</p>
                <h3>{progress?.range_start ?? start}–{progress?.range_end ?? end}</h3>
                <span>{strongCards} dominadas · {learningCards} en progreso</span>
              </div>
            </section>
            {progressModes.length > 0 && (
              <section className="mode-progress" aria-label="Progreso por tipo de ejercicio">
                <div className="section-heading">
                  <div><p className="eyebrow">Por ejercicio</p><h2>Precisión y velocidad</h2></div>
                </div>
                <div className="mode-progress__list">
                  {progressModes.map((item) => (
                    <article key={item.mode}>
                      <span><strong>{modeInfo[item.mode].short}</strong><small>{item.total} respuestas</small></span>
                      <span><strong>{item.accuracy}%</strong><small>{(item.average_time_ms / 1000).toFixed(1)} s</small></span>
                    </article>
                  ))}
                </div>
              </section>
            )}
            <section className="deck-map" aria-label="Mapa de dominio de la baraja">
              {progressCards.map((card) => (
                <span
                  key={card.position}
                  className={card.status}
                  title={card.total
                    ? `Últimas ${card.recent_attempts?.length ?? 0}: ${card.recent_accuracy ?? 0}% · ${((card.recent_average_time_ms ?? 0) / 1000).toFixed(1)} s`
                    : "Sin estudiar"}
                >{card.position}</span>
              ))}
            </section>
            <div className="legend">
              <span><i className="strong" />Dominada</span><span><i className="learning" />En progreso</span>
              <span><i className="weak" />Débil</span><span><i className="unseen" />Sin estudiar</span>
            </div>
            <p className="progress-criteria">Dominada: las últimas 5 respuestas son correctas. La velocidad se mide por separado.</p>
          </div>
        )}

        {view === "deck" && (
          <div className="view-content">
            <section className="page-intro deck-intro">
              <p className="eyebrow">Orden completo</p>
              <h2>Las 52 cartas</h2>
              <p>De la posición 1, arriba, a la 52, abajo.</p>
            </section>
            <section className="full-deck" aria-label="Orden completo de Mnemónica">
              {stack.map((card, index) => (
                <article className="deck-card-tile" key={card.label} aria-label={`Posición ${index + 1}: ${card.label}`}>
                  <span className="deck-position">{index + 1}</span>
                  <CardFace card={card} compact />
                </article>
              ))}
            </section>
            <p className="deck-footnote">La posición indica el número de la carta desde arriba.</p>
          </div>
        )}

        {view === "settings" && (
          <div className="view-content">
            <section className="page-intro">
              <p className="eyebrow">Ajustes</p>
              <h2>Tu aplicación</h2>
              <p>Las preferencias y las sesiones pendientes se conservan en este dispositivo.</p>
            </section>

            <section className="settings-card appearance-card">
              <div className="setting-title"><span><Palette /></span><h3>Apariencia</h3></div>
              <p>Elige el aspecto de la aplicación.</p>
              <div className="theme-options" role="radiogroup" aria-label="Apariencia de la aplicación">
                {([
                  { value: "system", label: "Automático", icon: <Smartphone /> },
                  { value: "light", label: "Claro", icon: <Sun /> },
                  { value: "dark", label: "Oscuro", icon: <Moon /> },
                ] as const).map((option) => (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={themePreference === option.value}
                    className={themePreference === option.value ? "selected" : ""}
                    key={option.value}
                    onClick={() => setThemePreference(option.value)}
                  >
                    {option.icon}
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="settings-card install-card">
              <div className="setting-title"><span><Download /></span><h3>Instalar Mnemónica</h3></div>
              <p>Ábrela desde la pantalla de inicio y úsala también cuando la conexión falle.</p>
              {installPrompt ? (
                <Button className="primary-action" onClick={() => void installApp()}><Download /> Instalar aplicación</Button>
              ) : (
                <div className="install-help"><strong>En iPhone</strong><span>Safari → Compartir → Añadir a pantalla de inicio.</span></div>
              )}
            </section>

            <section className="settings-card storage-card">
              <div className="setting-title"><span>{isOnline ? <Cloud /> : <CloudOff />}</span><h3>Guardado</h3></div>
              <div className="storage-status">
                <span><strong>{isOnline ? "Con conexión" : "Sin conexión"}</strong><small>{pendingCount ? `${pendingCount} ${pendingCount === 1 ? "sesión pendiente" : "sesiones pendientes"}` : "Todo sincronizado"}</small></span>
                {pendingCount > 0 && isOnline && <button onClick={() => void flushPendingSessions()}><RefreshCcw /> Sincronizar</button>}
              </div>
            </section>

            <section className="settings-card backend-card">
              <div className="setting-title"><span><Cloud /></span><h3>Google Sheets</h3></div>
              <p>La clave y tu correo se guardan solo en este dispositivo; nunca se publican en GitHub.</p>
              <label className="backend-field">
                <span>Correo asociado al progreso</span>
                <input type="email" autoComplete="email" value={backendEmail} onChange={(event) => setBackendEmail(event.target.value)} placeholder="tu@correo.com" />
              </label>
              <label className="backend-field">
                <span>Nombre</span>
                <input type="text" autoComplete="name" value={backendName} onChange={(event) => setBackendName(event.target.value)} placeholder="Tu nombre" />
              </label>
              <label className="backend-field">
                <span>Clave de acceso</span>
                <input type="password" autoComplete="current-password" value={backendSecret} onChange={(event) => setBackendSecret(event.target.value)} placeholder="Pega la clave de Apps Script" />
              </label>
              {backendMessage && <p className="backend-message" role="status">{backendMessage}</p>}
              <Button className="primary-action" onClick={() => void connectBackend()}><Cloud /> Guardar y comprobar</Button>
              {backendConfigured && <Button variant="ghost" onClick={disconnectBackend}>Eliminar clave de este dispositivo</Button>}
            </section>
          </div>
        )}

        <nav className="bottom-nav" aria-label="Navegación principal">
          <button className={view === "home" ? "active" : ""} onClick={() => setView("home")}><Home /><span>Inicio</span></button>
          <button className={view === "practice" ? "active" : ""} onClick={() => setView("practice")}><Brain /><span>Entrenar</span></button>
          <button className={view === "deck" ? "active" : ""} onClick={() => setView("deck")}><LayoutGrid /><span>Baraja</span></button>
          <button className={view === "progress" ? "active" : ""} onClick={() => setView("progress")}><BarChart3 /><span>Progreso</span></button>
        </nav>
      </div>
    </main>
  );
}
