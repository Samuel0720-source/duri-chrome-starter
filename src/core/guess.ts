// "상대 선택 맞히기" question bank. The database picks 3 of these by index (0-11),
// so keep exactly 12 questions with exactly 4 options each (see start_guess_game).
export const guessQuestions = [
  { q: "주말 아침에 더 끌리는 건?", options: ["늦잠", "브런치", "산책", "운동"] },
  { q: "데이트 장소를 고른다면?", options: ["카페", "전시회", "한강", "집"] },
  { q: "지금 당장 먹고 싶은 건?", options: ["떡볶이", "초밥", "치킨", "파스타"] },
  { q: "여행을 간다면?", options: ["바다", "산", "도시", "온천"] },
  { q: "기념일 선물로 받고 싶은 건?", options: ["손편지", "꽃", "여행", "맛있는 저녁"] },
  { q: "같이 본다면 어떤 영화?", options: ["로맨스", "액션", "공포", "애니메이션"] },
  { q: "더 좋은 연락 방법은?", options: ["전화", "문자", "영상통화", "만나서"] },
  { q: "비 오는 날 하고 싶은 건?", options: ["영화", "낮잠", "카페", "드라이브"] },
  { q: "다퉜을 때 먼저 하는 건?", options: ["바로 대화", "잠깐 시간 갖기", "맛있는 거 사 주기", "편지 쓰기"] },
  { q: "함께 배우고 싶은 건?", options: ["요리", "춤", "운동", "외국어"] },
  { q: "디저트 하나만 고른다면?", options: ["케이크", "아이스크림", "마카롱", "붕어빵"] },
  { q: "꿈꾸는 휴일 밤은?", options: ["야경 산책", "같이 게임", "영화 몰아보기", "노래방"] },
] as const;

export type GuessRound = {
  round: number;
  question: number;
  mine: { own: number; guess: number } | null;
  partnerAnswered: boolean;
  partner: { own: number; guess: number } | null;
};
export type GuessState =
  | { game: null }
  | { game: string; finished: boolean; rounds: GuessRound[]; score: { me: number; partner: number } };
