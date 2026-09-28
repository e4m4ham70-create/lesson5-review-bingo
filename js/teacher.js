import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";


import {
  getAuth,
  signInAnonymously
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";


import {
  getFirestore,
  doc,
  setDoc,
  onSnapshot,
  collection,
  getDocs,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";


import {
  firebaseConfig
} from "./firebase-config.js";


import {
  questions
} from "./questions.js";



/* ==================================================
   Firebase 시작
================================================== */

const app =
  initializeApp(firebaseConfig);


const auth =
  getAuth(app);


const db =
  getFirestore(app);


/* 익명 로그인 */

await signInAnonymously(auth);



/* ==================================================
   기본 변수
================================================== */

const $ =
  selector =>
    document.querySelector(selector);



const esc =
  value =>

    String(value ?? "")
      .replace(

        /[&<>"']/g,

        character =>

          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
          }[character])

      );



const cleanRoom =
  value =>

    value
      .trim()
      .toUpperCase()
      .replace(
        /[^A-Z0-9_-]/g,
        ""
      );



let room = "";

let roomRef = null;

let drawn = [];

let students = [];

let currentDraw = null;

let unsubscribeRoom = null;

let unsubscribeStudents = null;
/* ==================================================
   학생 답안 분석
================================================== */

// 학생 답을 비교하기 좋은 형태로 바꾸기
function normalizeAnswer(value) {

  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.,!?;:]+$/g, "");

}


// 학생 답과 정답 비교
function isCorrect(studentAnswer, correctAnswer) {

  return (
    normalizeAnswer(studentAnswer) ===
    normalizeAnswer(correctAnswer)
  );

}


// 백분율 계산
function percent(value, total) {

  if (!total) return 0;

  return Math.round(
    (value / total) * 100
  );

}


// 성취율에 따른 진단
function levelLabel(rate) {

  if (rate >= 80) {
    return "이해 양호";
  }

  if (rate >= 60) {
    return "부분 보완 필요";
  }

  return "집중 보완 필요";
}


// Reading 또는 Grammar 문항만 가져오기
function partQuestions(part) {

  return questions.filter(
    question =>
      question.part === part
  );

}


// 학생 한 명의 특정 영역 분석
function studentPartStats(student, part) {

  const items =
    partQuestions(part);

  const answerMap =
    student.answers || {};

  let answered = 0;
  let correct = 0;


  items.forEach(question => {

    const answer =
      String(
        answerMap[question.n] ??
        answerMap[String(question.n)] ??
        ""
      ).trim();


    // 학생이 답을 작성한 경우
    if (answer) {

      answered++;


      // 정답이면 correct 증가
      if (
        isCorrect(
          answer,
          question.a
        )
      ) {

        correct++;

      }

    }

  });


  const total =
    items.length;

  const incorrect =
    answered - correct;

  const unanswered =
    total - answered;

  const achievementRate =
    percent(
      correct,
      total
    );

  const responseRate =
    percent(
      answered,
      total
    );


  return {

    total,
    answered,
    correct,
    incorrect,
    unanswered,
    achievementRate,
    responseRate,

    label:
      levelLabel(
        achievementRate
      )

  };

}
/* ==================================================
   분석 결과 표시용 함수
================================================== */

// 성취 수준별 글자 색
function levelStyle(rate) {

  if (rate >= 80) {
    return "color:#0f7a50;font-weight:900;";
  }

  if (rate >= 60) {
    return "color:#b26a00;font-weight:900;";
  }

  return "color:#c62828;font-weight:900;";
}


// 학생의 우선 보완 영역 판단
function studentDiagnosis(student) {

  const reading =
    studentPartStats(
      student,
      "Reading"
    );

  const grammar =
    studentPartStats(
      student,
      "Grammar"
    );


  // 아무 문제도 풀지 않은 경우
  if (
    reading.answered === 0 &&
    grammar.answered === 0
  ) {

    return "아직 응답 없음";

  }


  // 두 영역 모두 낮은 경우
  if (
    reading.achievementRate < 60 &&
    grammar.achievementRate < 60
  ) {

    return "Reading · Grammar 모두 보완";

  }


  // Reading이 60% 미만
  if (
    reading.achievementRate < 60
  ) {

    return "Reading 우선 보완";

  }


  // Grammar가 60% 미만
  if (
    grammar.achievementRate < 60
  ) {

    return "Grammar 우선 보완";

  }


  // 두 영역 모두 60% 이상이면 상대 비교
  const gap =
    reading.achievementRate -
    grammar.achievementRate;


  if (gap <= -10) {

    return "Reading 상대적 보완";

  }


  if (gap >= 10) {

    return "Grammar 상대적 보완";

  }


  return "두 영역 균형";

}

/* ==================================================
   교실 열기
================================================== */

$("#openRoomBtn").onclick =
  async () => {


    room =
      cleanRoom(
        $("#roomCode").value
      );


    if (!room) {

      alert(
        "학급 코드를 입력하세요."
      );

      return;

    }


    roomRef =
      doc(
        db,
        "rooms",
        room
      );


    await setDoc(

      roomRef,

      {

        roomCode: room,

        updatedAt:
          serverTimestamp()

      },

      {
        merge: true
      }

    );


    $("#teacherJoin")
      .classList
      .add("hidden");


    $("#dashboard")
      .classList
      .remove("hidden");


    $("#roomInfo").textContent =

      `현재 학급 코드: ${room} · 학생들에게 이 코드를 알려 주세요.`;


    listenRoom();

    listenStudents();

    loadRoomHistory();

  };



/* ==================================================
   교실 데이터 실시간 감시
================================================== */

function listenRoom() {

  if (unsubscribeRoom) {
    unsubscribeRoom();
  }

  unsubscribeRoom = onSnapshot(
    roomRef,
    snapshot => {

      const data =
        snapshot.data() || {};

      drawn =
        data.drawn || [];

      currentDraw =
        data.currentDraw || null;

      renderDraw(
        currentDraw
      );

      renderHistory();

    }
  );

}



/* ==================================================
   현재 추첨 문항 표시
================================================== */

function renderDraw(item) {


  const revealButton =
    $("#revealAnswerBtn");



  /* 아직 추첨하지 않았을 때 */

  if (!item) {


    $("#drawNo").textContent =
      "READY";


    $("#drawQ").textContent =
      "랜덤 문항을 뽑아 주세요.";


    $("#drawA").textContent =
      "—";


    revealButton
      .classList
      .add("hidden");


    revealButton.disabled =
      false;


    revealButton.textContent =
      "정답 보기";


    return;

  }



  /* 문제 번호 */

  $("#drawNo").textContent =
    `Q${item.n}`;



  /* 문제 */

  $("#drawQ").textContent =
    item.q;



  /* 정답이 공개된 경우 */

  if (
    item.revealed === true
  ) {


    $("#drawA").textContent =
      item.a;


    revealButton
      .classList
      .remove("hidden");


    revealButton.disabled =
      true;


    revealButton.textContent =
      "정답 공개됨";


  }


  /* 정답을 아직 공개하지 않은 경우 */

  else {


    $("#drawA").textContent =
      "정답을 확인해 보세요!";


    revealButton
      .classList
      .remove("hidden");


    revealButton.disabled =
      false;


    revealButton.textContent =
      "정답 보기";

  }

}



/* ==================================================
   랜덤 문항 추첨
================================================== */

$("#drawBtn").onclick =
  async () => {


    /* 이전 문항의 정답을 아직
       공개하지 않았다면 다음 문제 제한 */

    if (
      currentDraw &&
      currentDraw.revealed !== true
    ) {


      alert(
        "현재 문항의 정답을 먼저 공개한 후 다음 문항을 뽑아 주세요."
      );


      return;

    }



    /* 이미 나온 문제 번호 */

    const usedNumbers =
      new Set(

        drawn.map(
          item => item.n
        )

      );



    /* 아직 나오지 않은 문제 */

    const remainingQuestions =

      questions.filter(

        question =>
          !usedNumbers.has(
            question.n
          )

      );



    /* 모든 문제를 사용한 경우 */

    if (
      remainingQuestions.length === 0
    ) {


      alert(
        "15문항을 모두 추첨했습니다."
      );


      return;

    }



    /* 랜덤 문제 선택 */

    const randomQuestion =

      remainingQuestions[

        Math.floor(

          Math.random() *
          remainingQuestions.length

        )

      ];



    /* 새 추첨 데이터 */

    const newDraw = {

      n:
        randomQuestion.n,

      q:
        randomQuestion.q,

      a:
        randomQuestion.a,

      revealed:
        false

    };



    /* 추첨 기록 */

    const updatedDrawn = [

      ...drawn,

      newDraw

    ];



    /* Firebase 저장 */

    await setDoc(
  roomRef,

  {
    currentDraw:
      newDraw,

    drawn:
      updatedDrawn,

    // 교사가 문제 추첨을 시작하면 게임 시작
    gameStarted:
      true,

    updatedAt:
      serverTimestamp()
  },

  {
    merge: true
  }

);
};


/* ==================================================
   정답 보기
================================================== */

$("#revealAnswerBtn").onclick =
  async () => {


    if (!currentDraw) {


      alert(
        "먼저 문항을 추첨하세요."
      );


      return;

    }



    /* 이미 정답을 공개했다면 종료 */

    if (
      currentDraw.revealed === true
    ) {

      return;

    }



    /* 현재 문제 정답 공개 */

    const revealedDraw = {

      ...currentDraw,

      revealed:
        true

    };



    /* 추첨 기록에서도 정답 공개 상태로 변경 */

    const updatedHistory =

      drawn.map(

        item => {


          if (
            item.n ===
            currentDraw.n
          ) {


            return {

              ...item,

              revealed:
                true

            };

          }


          return item;

        }

      );



    /* Firebase에 업데이트 */

    await setDoc(

      roomRef,

      {

        currentDraw:
          revealedDraw,

        drawn:
          updatedHistory,

        updatedAt:
          serverTimestamp()

      },

      {
        merge: true
      }

    );

  };



/* ==================================================
   추첨 기록 표시
================================================== */

function renderHistory() {


  const root =
    $("#drawHistory");


  root.innerHTML =
    "";



  if (
    drawn.length === 0
  ) {


    root.innerHTML =

      `
      <div class="note">
        아직 추첨 기록이 없습니다.
      </div>
      `;


    return;

  }



  [...drawn]
    .reverse()
    .forEach(

      item => {


        const element =
          document.createElement(
            "div"
          );


        element.className =
          "student-card";



        /* 정답 공개 */

        if (
          item.revealed === true
        ) {


          element.innerHTML =

            `
            <b>
              Q${item.n}
            </b>

            ·

            ${esc(item.a)}
            `;

        }


        /* 정답 미공개 */

        else {


          element.innerHTML =

            `
            <b>
              Q${item.n}
            </b>

            ·

            <span
              style="color:#6b7280"
            >
              정답 미공개
            </span>
            `;

        }



        root.appendChild(
          element
        );

      }

    );

}



/* ==================================================
   추첨 초기화
================================================== */

$("#resetDrawBtn").onclick =
  async () => {


    const ok =
      confirm(

        "추첨 기록을 모두 초기화할까요?\n학생의 문제 답, 빙고판과 체크 기록은 유지됩니다."

      );


    if (!ok) {

      return;

    }



    await setDoc(

      roomRef,

      {

        currentDraw:
          null,

        drawn:
          [],

        updatedAt:
          serverTimestamp()

      },

      {
        merge: true
      }

    );

  };

/* ==================================================
   학생 편집 잠금 해제
================================================== */

const unlockGameBtn =
  $("#unlockGameBtn");

if (unlockGameBtn) {

  unlockGameBtn.onclick = async () => {

    if (!roomRef) {
      return alert(
        "먼저 교실을 열어 주세요."
      );
    }

    const ok = confirm(
      "학생들의 문제 답과 빙고판 편집을 다시 허용할까요?\n\n" +
      "기존 학생 답안, 빙고판, 분석 기록은 그대로 유지됩니다."
    );

    if (!ok) return;

    await setDoc(
      roomRef,
      {
        gameStarted: false,
        updatedAt: serverTimestamp()
      },
      {
        merge: true
      }
    );

    alert(
      "학생 편집 잠금이 해제되었습니다.\n" +
      "학생들이 다시 문제와 빙고판을 수정할 수 있습니다."
    );

  };

}


/* ==================================================
   학생 목록 실시간 확인
================================================== */

function listenStudents() {

  // 이전 교실의 학생 실시간 연결 해제
  if (unsubscribeStudents) {
    unsubscribeStudents();
  }

  // 현재 선택된 교실의 students 컬렉션 연결
  unsubscribeStudents = onSnapshot(

    collection(
      db,
      "rooms",
      room,
      "students"
    ),

    snap => {

      console.log(
        "현재 교실:",
        room,
        "학생 문서 수:",
        snap.size
      );

      students = snap.docs.map(
        d => ({
          id: d.id,
          ...d.data()
        })
      );


      // 학생 번호 순서대로 정렬
      students.sort(
        (a, b) =>
          (Number(a.no) || 999) -
          (Number(b.no) || 999) ||
          String(a.no || "").localeCompare(
            String(b.no || "")
          )
      );


      // 화면 다시 표시
      renderStudents();

      renderStudentAnalysis();

      renderClassAnalysis();

    },

    error => {

      console.error(
        "학생 데이터 불러오기 오류:",
        error
      );

    }

  );

}



/* ==================================================
   학생 현황 표시
================================================== */

function renderStudents() {


  $("#studentCount").textContent =

    `${students.length}명`;



  const tbody =
    $("#studentRows");


  tbody.innerHTML =
    "";



  students.forEach(

    student => {


      /* 답 입력 개수 */

      const answered =

        student.answeredCount ??

        Object
          .values(
            student.answers || {}
          )
          .filter(

            value =>
              String(value)
                .trim()

          )
          .length;



      /* 빙고판에 배치한 문제 개수 */

      const placed =

        student.placedCount ??

        (student.board || [])
          .filter(

            item =>
              item?.type === "q"

          )
          .length;



      /* 체크 수 */

      const checked =

        (student.marked || [])
          .length;



      /* 빙고 줄 수 */

      const bingo =

        student.bingoLines || 0;



      const row =
        document.createElement(
          "tr"
        );



      row.innerHTML =

        `
        <td>
          ${esc(student.no)}
        </td>


        <td>
          ${esc(student.name)}
        </td>


        <td>
          ${answered}/15
        </td>


        <td>
          ${placed}
        </td>


        <td>
          ${checked}
        </td>


        <td>

          <b>

            ${
              bingo >= 2
                ? "🎉 "
                : ""
            }

            ${bingo}줄

          </b>

        </td>


        <td>

          <button
            class="ghost view-btn"
            data-id="${esc(student.id)}"
          >
            보기
          </button>

        </td>
        `;



      tbody.appendChild(
        row
      );

    }

  );



  /* 빙고판 보기 버튼 */

  document
    .querySelectorAll(
      ".view-btn"
    )
    .forEach(

      button => {


        button.onclick =
          () => {


            openBoard(
              button.dataset.id
            );

          };

      }

    );

}



/* ==================================================
   4 × 4 빙고 줄
================================================== */

function getBingoLines() {


  const result =
    [];



  /* 가로 */

  for (
    let row = 0;
    row < 4;
    row++
  ) {


    result.push([

      row * 4,

      row * 4 + 1,

      row * 4 + 2,

      row * 4 + 3

    ]);

  }



  /* 세로 */

  for (
    let column = 0;
    column < 4;
    column++
  ) {


    result.push([

      column,

      column + 4,

      column + 8,

      column + 12

    ]);

  }



  /* 대각선 */

  result.push(

    [0, 5, 10, 15],

    [3, 6, 9, 12]

  );



  return result;

}



/* ==================================================
   학생 개별 빙고판 보기
================================================== */

function openBoard(
  studentId
) {


  const student =

    students.find(

      item =>
        item.id === studentId

    );



  if (!student) {

    return;

  }



  const board =

    Array.isArray(
      student.board
    ) &&

    student.board.length === 16

      ? student.board

      : Array(16).fill(null);



  const marked =

    new Set(

      student.marked || []

    );



  const completedLines =

    getBingoLines()
      .filter(

        line =>

          line.every(

            index =>

              board[index] &&

              marked.has(index)

          )

      );



  $("#modalTitle").textContent =

    `${student.no}번 ${student.name} 학생 빙고판`;



  const root =
    $("#modalBoard");


  root.innerHTML =
    "";



  board.forEach(

    (slot, index) => {


      const cell =
        document.createElement(
          "div"
        );



      /* 빈칸 */

      if (!slot) {


        cell.className =
          "cell empty";


        cell.textContent =
          "빈칸";

      }


      /* 내용이 있는 칸 */

      else {


        cell.className =

          `cell filled ${
            slot.type === "free"
              ? "free"
              : ""
          } ${
            marked.has(index)
              ? "marked"
              : ""
          }`;



        /* 완성된 빙고 줄 */

        if (

          completedLines.some(

            line =>
              line.includes(index)

          )

        ) {


          cell.classList.add(
            "line"
          );

        }



        /* FREE 또는 학생 답 */

        if (
          slot.type === "free"
        ) {


          cell.textContent =
            "FREE";

        }


        else {


          cell.innerHTML =

            `
            <div>

              <span class="small">
                Q${slot.n}
              </span>

              ${esc(slot.answer)}

            </div>
            `;

        }

      }



      root.appendChild(
        cell
      );

    }

  );



  /* 학생 빙고 상태 */

  if (
    completedLines.length >= 2
  ) {


    $("#modalStatus").textContent =

      `🎉 BINGO! ${completedLines.length}줄 완성`;

  }


  else {


    $("#modalStatus").textContent =

      `현재 ${completedLines.length}줄 완성`;

  }



  $("#boardModal")
    .classList
    .remove("hidden");

}



/* ==================================================
   학생 빙고판 모달 닫기
================================================== */

$("#closeModal").onclick =
  () => {


    $("#boardModal")
      .classList
      .add("hidden");

  };



/* 바깥 영역 클릭 시 닫기 */

$("#boardModal").onclick =
  event => {


    if (
      event.target ===
      $("#boardModal")
    ) {


      $("#boardModal")
        .classList
        .add("hidden");

    }

  };
  /* ==================================================
   학습 분석 탭 전환
================================================== */

/* ==================================================
   학습 분석 탭 전환
================================================== */

const studentAnalysisTab =
  document.querySelector("#studentAnalysisTab");

const classAnalysisTab =
  document.querySelector("#classAnalysisTab");

const studentAnalysisPanel =
  document.querySelector("#studentAnalysisPanel");

const classAnalysisPanel =
  document.querySelector("#classAnalysisPanel");


studentAnalysisTab.onclick = () => {

  // 학생별 분석 활성화
  studentAnalysisTab.classList.add("active");

  classAnalysisTab.classList.remove("active");


  // 학생별 분석만 표시
  studentAnalysisPanel.classList.remove("hidden");

  classAnalysisPanel.classList.add("hidden");

};


classAnalysisTab.onclick = () => {

  // 교실별 분석 활성화
  classAnalysisTab.classList.add("active");

  studentAnalysisTab.classList.remove("active");


  // 교실별 분석만 표시
  classAnalysisPanel.classList.remove("hidden");

  studentAnalysisPanel.classList.add("hidden");

};

/* 교실별 분석 버튼 */

classAnalysisTab.addEventListener(
  "click",
  () => {

    // 교실별 분석 버튼 활성화
    classAnalysisTab.classList.add("active");

    // 학생별 분석 버튼 비활성화
    studentAnalysisTab.classList.remove("active");


    // 교실별 분석 화면 표시
    classAnalysisPanel.classList.remove("hidden");

    // 학생별 분석 화면 숨기기
    studentAnalysisPanel.classList.add("hidden");

  }
);
/* ==================================================
   학생별 학습 분석 표시
================================================== */

function renderStudentAnalysis() {

  const root =
    document.querySelector(
      "#studentAnalysisRows"
    );


  // 분석표가 HTML에 없는 경우
  if (!root) {
    return;
  }


  root.innerHTML = "";


  // 아직 학생이 없을 때
  if (students.length === 0) {

    root.innerHTML = `
      <tr>
        <td colspan="8">
          아직 참여한 학생이 없습니다.
        </td>
      </tr>
    `;

    return;

  }


  // 학생 한 명씩 분석
  students.forEach(student => {


    const reading =
      studentPartStats(
        student,
        "Reading"
      );


    const grammar =
      studentPartStats(
        student,
        "Grammar"
      );


    const diagnosis =
      studentDiagnosis(
        student
      );


    const row =
      document.createElement(
        "tr"
      );


    row.innerHTML = `

      <td>
        ${esc(student.no)}
      </td>


      <td>
        ${esc(student.name)}
      </td>


      <!-- Reading -->

      <td>

        <b>
          ${reading.correct}/${reading.total}
        </b>

        (${reading.achievementRate}%)

        <br>

        <span class="note">
          오답 ${reading.incorrect}
          ·
          미응답 ${reading.unanswered}
        </span>

      </td>


      <!-- Reading 진단 -->

      <td>

        <span
          style="${levelStyle(
            reading.achievementRate
          )}"
        >
          ${reading.label}
        </span>

      </td>


      <!-- Grammar -->

      <td>

        <b>
          ${grammar.correct}/${grammar.total}
        </b>

        (${grammar.achievementRate}%)

        <br>

        <span class="note">
          오답 ${grammar.incorrect}
          ·
          미응답 ${grammar.unanswered}
        </span>

      </td>


      <!-- Grammar 진단 -->

      <td>

        <span
          style="${levelStyle(
            grammar.achievementRate
          )}"
        >
          ${grammar.label}
        </span>

      </td>


      <!-- 보완 영역 -->

      <td>

        <b>
          ${diagnosis}
        </b>

      </td>


      <!-- 상세 보기 -->

      <td>

        <button
          class="ghost analysis-detail-btn"
          data-id="${esc(student.id)}"
        >
          상세 보기
        </button>

      </td>

    `;


    root.appendChild(
      row
    );

  });

}

/* ==================================================
   학생별 상세 보기 버튼 클릭
================================================== */

const studentAnalysisRows =
  document.querySelector("#studentAnalysisRows");

studentAnalysisRows.addEventListener(
  "click",
  event => {

    const button =
      event.target.closest(".analysis-detail-btn");

    if (!button) {
      return;
    }

    const studentId =
      button.dataset.id;

    openStudentAnalysis(studentId);

  }
);

/* ==================================================
   학생별 상세 분석 열기
================================================== */

function openStudentAnalysis(studentId) {

  // 선택한 학생 찾기
  const student =
    students.find(
      item => item.id === studentId
    );


  if (!student) {
    return;
  }


  // Reading 분석
  const reading =
    studentPartStats(
      student,
      "Reading"
    );


  // Grammar 분석
  const grammar =
    studentPartStats(
      student,
      "Grammar"
    );


  // 종합 진단
  const diagnosis =
    studentDiagnosis(student);


  /* --------------------------
     상세 창 제목
  -------------------------- */

  document.querySelector(
    "#analysisModalTitle"
  ).textContent =
    `${student.no}번 ${student.name} 학생 학습 분석`;


  /* --------------------------
     학생 종합 진단
  -------------------------- */

  document.querySelector(
    "#studentAnalysisSummary"
  ).innerHTML = `

    <b>
      ${diagnosis}
    </b>

    <br>

    <span class="note">
      이번 Lesson 4 Review Bingo의
      15문항 응답을 기준으로 분석한 결과입니다.
    </span>

  `;


  /* --------------------------
     Reading 결과
  -------------------------- */

  document.querySelector(
    "#detailReading"
  ).innerHTML = `

    ${reading.correct}/${reading.total}

    (${reading.achievementRate}%)

    <br>

    <span
      style="
        font-size:14px;
        ${levelStyle(
          reading.achievementRate
        )}
      "
    >
      ${reading.label}
    </span>

    <br>

    <span class="note">

      오답 ${reading.incorrect}
      ·
      미응답 ${reading.unanswered}

    </span>

  `;


  /* --------------------------
     Grammar 결과
  -------------------------- */

  document.querySelector(
    "#detailGrammar"
  ).innerHTML = `

    ${grammar.correct}/${grammar.total}

    (${grammar.achievementRate}%)

    <br>

    <span
      style="
        font-size:14px;
        ${levelStyle(
          grammar.achievementRate
        )}
      "
    >
      ${grammar.label}
    </span>

    <br>

    <span class="note">

      오답 ${grammar.incorrect}
      ·
      미응답 ${grammar.unanswered}

    </span>

  `;


  /* --------------------------
     Q1~Q15 상세 결과
  -------------------------- */

  const root =
    document.querySelector(
      "#studentDetailRows"
    );


  root.innerHTML = "";


  questions.forEach(question => {


    // 학생이 입력한 답
    const answer =
      String(

        student.answers?.[question.n] ??

        student.answers?.[
          String(question.n)
        ] ??

        ""

      ).trim();


    let result =
      "미응답";


    let resultStyle =
      "color:#6b7280;font-weight:800;";


    // 답을 작성한 경우
    if (answer) {


      // 정답
      if (
        isCorrect(
          answer,
          question.a
        )
      ) {

        result =
          "정답";

        resultStyle =
          "color:#0f7a50;font-weight:900;";

      }


      // 오답
      else {

        result =
          "오답";

        resultStyle =
          "color:#c62828;font-weight:900;";

      }

    }


    const row =
      document.createElement(
        "tr"
      );


    row.innerHTML = `

      <td>
        Q${question.n}
      </td>


      <td>
        ${question.part}
      </td>


      <td>
        ${
          answer
            ? esc(answer)
            : '<span class="note">미응답</span>'
        }
      </td>


      <td>
        ${esc(question.a)}
      </td>


      <td>

        <span
          style="${resultStyle}"
        >
          ${result}
        </span>

      </td>

    `;


    root.appendChild(row);

  });


  /* --------------------------
     상세 창 열기
  -------------------------- */

  document.querySelector(
    "#analysisModal"
  )
    .classList
    .remove("hidden");

}

/* ==================================================
   학생 분석 상세 창 닫기
================================================== */

document.querySelector(
  "#closeAnalysisModal"
).onclick = () => {

  document.querySelector(
    "#analysisModal"
  )
    .classList
    .add("hidden");

};


/* 창 바깥쪽을 누르면 닫기 */

document.querySelector(
  "#analysisModal"
).onclick = event => {

  if (
    event.target ===
    document.querySelector(
      "#analysisModal"
    )
  ) {

    document.querySelector(
      "#analysisModal"
    )
      .classList
      .add("hidden");

  }

};

/* ==================================================
   교실별 영역 분석
================================================== */

function classPartStats(part) {

  // Reading 또는 Grammar 문항 가져오기
  const items =
    partQuestions(part);


  // 학생 수 × 해당 영역 문항 수
  const possible =
    students.length * items.length;


  let answered = 0;
  let correct = 0;


  // 학생별 결과를 모두 합산
  students.forEach(student => {

    const stats =
      studentPartStats(
        student,
        part
      );


    answered += stats.answered;

    correct += stats.correct;

  });


  // 해당 영역에서 60% 미만인 학생 수
  const supportStudents =
    students.filter(student => {

      const stats =
        studentPartStats(
          student,
          part
        );

      return (
        stats.achievementRate < 60
      );

    }).length;


  return {

    possible,

    answered,

    correct,

    achievementRate:
      percent(
        correct,
        possible
      ),

    responseRate:
      percent(
        answered,
        possible
      ),

    supportStudents

  };

}

/* ==================================================
   문항별 학급 분석
================================================== */

function questionStats(question) {

  let answered = 0;

  let correct = 0;


  students.forEach(student => {

    const answer =
      String(

        student.answers?.[question.n] ??

        student.answers?.[
          String(question.n)
        ] ??

        ""

      ).trim();


    // 답을 작성한 경우
    if (answer) {

      answered++;


      if (
        isCorrect(
          answer,
          question.a
        )
      ) {

        correct++;

      }

    }

  });


  const incorrect =
    answered - correct;


  const unanswered =
    students.length - answered;


  return {

    answered,

    correct,

    incorrect,

    unanswered,


    // 전체 학생 대비 정답 비율
    achievementRate:
      percent(
        correct,
        students.length
      ),


    // 전체 학생 대비 응답 비율
    responseRate:
      percent(
        answered,
        students.length
      )

  };

}

/* ==================================================
   교실별 분석 화면 표시
================================================== */

function renderClassAnalysis() {

  const reading =
    classPartStats(
      "Reading"
    );


  const grammar =
    classPartStats(
      "Grammar"
    );


  /* ------------------------------
     학생이 아직 없는 경우
  ------------------------------ */

  if (students.length === 0) {

    document.querySelector(
      "#classReadingRate"
    ).textContent = "-";


    document.querySelector(
      "#classGrammarRate"
    ).textContent = "-";


    document.querySelector(
      "#classReadingMeta"
    ).textContent =
      "아직 학생 데이터가 없습니다.";


    document.querySelector(
      "#classGrammarMeta"
    ).textContent =
      "아직 학생 데이터가 없습니다.";


    document.querySelector(
      "#classPriority"
    ).textContent = "-";


    document.querySelector(
      "#classPriorityMeta"
    ).textContent =
      "학생이 참여하면 자동으로 분석됩니다.";


    document.querySelector(
      "#questionAnalysisRows"
    ).innerHTML = `

      <tr>

        <td colspan="8">

          아직 학생 데이터가 없습니다.

        </td>

      </tr>

    `;


    return;

  }


  /* ------------------------------
     Reading 전체 분석
  ------------------------------ */

  document.querySelector(
    "#classReadingRate"
  ).textContent =
    `${reading.achievementRate}%`;


  document.querySelector(
    "#classReadingMeta"
  ).textContent =

    `정답 ${reading.correct}/${reading.possible}
     · 응답률 ${reading.responseRate}%
     · 집중 보완 학생 ${reading.supportStudents}명`;



  /* ------------------------------
     Grammar 전체 분석
  ------------------------------ */

  document.querySelector(
    "#classGrammarRate"
  ).textContent =
    `${grammar.achievementRate}%`;


  document.querySelector(
    "#classGrammarMeta"
  ).textContent =

    `정답 ${grammar.correct}/${grammar.possible}
     · 응답률 ${grammar.responseRate}%
     · 집중 보완 학생 ${grammar.supportStudents}명`;



  /* ------------------------------
     우선 보완 영역 판단
  ------------------------------ */

  let priority =
    "두 영역 균형";


  if (
    reading.achievementRate < 60 &&
    grammar.achievementRate < 60
  ) {

    priority =
      "Reading · Grammar 모두";

  }

  else if (
    reading.achievementRate <
    grammar.achievementRate
  ) {

    priority =
      "Reading";

  }

  else if (
    grammar.achievementRate <
    reading.achievementRate
  ) {

    priority =
      "Grammar";

  }


  document.querySelector(
    "#classPriority"
  ).textContent =
    priority;


  const gap =
    Math.abs(
      reading.achievementRate -
      grammar.achievementRate
    );


  document.querySelector(
    "#classPriorityMeta"
  ).textContent =

    `Reading ${reading.achievementRate}%
     · Grammar ${grammar.achievementRate}%
     · 차이 ${gap}%p`;



  /* ------------------------------
     Q1~Q15 문항별 분석
  ------------------------------ */

  const root =
    document.querySelector(
      "#questionAnalysisRows"
    );


  root.innerHTML =
    "";


  questions.forEach(question => {

    const stats =
      questionStats(
        question
      );


    const row =
      document.createElement(
        "tr"
      );


    row.innerHTML = `

      <td>
        Q${question.n}
      </td>


      <td>
        ${question.part}
      </td>


      <td>
        ${esc(question.a)}
      </td>


      <td>
        ${stats.correct}
      </td>


      <td>
        ${stats.incorrect}
      </td>


      <td>
        ${stats.unanswered}
      </td>


      <td>
        <b>
          ${stats.achievementRate}%
        </b>
      </td>


      <td>
        ${stats.responseRate}%
      </td>

    `;


    root.appendChild(
      row
    );

  });

}

/* ==================================================
   지난 수업 기록 불러오기
================================================== */
/* ==================================================
   지난 수업 기록용 영역별 성취율 계산
================================================== */

function roomPartStats(studentList, part) {

  const items =
    partQuestions(part);

  const possible =
    studentList.length * items.length;

  let answered = 0;
  let correct = 0;

  studentList.forEach(student => {

    const answerMap =
      student.answers || {};

    items.forEach(question => {

      const answer =
        String(
          answerMap[question.n] ??
          answerMap[String(question.n)] ??
          ""
        ).trim();

      if (answer) {

        answered++;

        if (
          isCorrect(
            answer,
            question.a
          )
        ) {
          correct++;
        }

      }

    });

  });

  return {

    achievementRate:
      percent(
        correct,
        possible
      ),

    responseRate:
      percent(
        answered,
        possible
      )

  };

}


/* ==================================================
   Firebase 날짜 표시
================================================== */

function formatRoomDate(timestamp) {

  if (
    !timestamp ||
    typeof timestamp.toDate !== "function"
  ) {
    return "날짜 정보 없음";
  }

  const date =
    timestamp.toDate();

  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      date.getDate()
    ).padStart(2, "0");

  return `${year}.${month}.${day}`;

}

async function loadRoomHistory() {

  const root =
    document.querySelector("#roomHistoryList");

  if (!root) return;


  root.innerHTML = `
    <div class="note">
      지난 수업 기록을 불러오는 중입니다...
    </div>
  `;


  try {

    const snapshot =
      await getDocs(
        collection(db, "rooms")
      );


    const rooms =
      snapshot.docs.map(docSnap => {

        return {
          id: docSnap.id,
          ...docSnap.data()
        };

      });


    if (rooms.length === 0) {

      root.innerHTML = `
        <div class="note">
          아직 저장된 수업 기록이 없습니다.
        </div>
      `;

      return;

    }


    // 최근 사용한 수업부터 표시
    rooms.sort((a, b) => {

      const aTime =
        a.updatedAt?.seconds || 0;

      const bTime =
        b.updatedAt?.seconds || 0;

      return bTime - aTime;

    });


    root.innerHTML = "";


    for (const roomData of rooms) {

  /* --------------------------------
     해당 수업의 학생 자료 가져오기
  -------------------------------- */

  const studentSnapshot =
    await getDocs(
      collection(
        db,
        "rooms",
        roomData.id,
        "students"
      )
    );


  const roomStudents =
    studentSnapshot.docs.map(
      docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      })
    );


  /* --------------------------------
     Reading / Grammar 분석
  -------------------------------- */

  const reading =
    roomPartStats(
      roomStudents,
      "Reading"
    );


  const grammar =
    roomPartStats(
      roomStudents,
      "Grammar"
    );


  /* --------------------------------
     최근 업데이트 날짜
  -------------------------------- */

  const lastDate =
    formatRoomDate(
      roomData.updatedAt
    );


  /* --------------------------------
     수업 기록 카드 만들기
  -------------------------------- */

  const item =
    document.createElement("div");


  item.className =
    "student-card";


  item.style.marginBottom =
    "10px";


  item.innerHTML = `

    <div
      class="row"
      style="
        justify-content:space-between;
        align-items:center;
        gap:16px;
      "
    >

      <div style="flex:1">


        <div
          style="
            font-size:17px;
            font-weight:900;
            margin-bottom:5px;
          "
        >
          ${esc(
            roomData.roomCode ||
            roomData.id
          )}
        </div>


        <div class="note">

          학생
          <b>${roomStudents.length}명</b>

          ·

          최근 업데이트
          <b>${lastDate}</b>

        </div>


        <div
          style="
            margin-top:7px;
            font-size:14px;
          "
        >

          <span
            style="
              font-weight:800;
              margin-right:14px;
            "
          >
            Reading
            ${reading.achievementRate}%
          </span>


          <span
            style="
              font-weight:800;
            "
          >
            Grammar
            ${grammar.achievementRate}%
          </span>

        </div>


      </div>


      <button
        class="ghost room-history-open-btn"
        data-room="${esc(roomData.id)}"
        type="button"
      >
        불러오기
      </button>


    </div>

  `;


  root.appendChild(item);

}

  }

  catch (error) {

    console.error(
      "지난 수업 기록 불러오기 오류:",
      error
    );


    root.innerHTML = `
      <div class="note">
        수업 기록을 불러오지 못했습니다.
      </div>
    `;

  }

}
/* ==================================================
   지난 수업 기록 불러오기 버튼
================================================== */

const roomHistoryList =
  document.querySelector("#roomHistoryList");

if (roomHistoryList) {

  roomHistoryList.addEventListener(
    "click",
    event => {

      const button =
        event.target.closest(
          ".room-history-open-btn"
        );

      if (!button) {
        return;
      }

      const selectedRoom =
        cleanRoom(
          button.dataset.room
        );

      if (!selectedRoom) {
        return;
      }

      // 선택한 교실을 현재 교실로 변경
      room = selectedRoom;

      roomRef =
        doc(
          db,
          "rooms",
          room
        );

      // 교실 코드 입력창에도 표시
      const roomCodeInput =
        document.querySelector("#roomCode");

      if (roomCodeInput) {
        roomCodeInput.value = room;
      }

      // 현재 교실 안내 문구 변경
      const roomInfo =
        document.querySelector("#roomInfo");

      if (roomInfo) {
        roomInfo.textContent =
          `지난 수업 기록 불러옴: ${room}`;
      }

      // 기존 화면 표시값 초기화
      students = [];
      drawn = [];
      currentDraw = null;

      renderStudents();
      renderStudentAnalysis();
      renderClassAnalysis();

      // 선택한 교실의 Firebase 자료 연결
      listenRoom();
      listenStudents();

    }
  );

}
/* ==================================================
   지난 수업 기록 새로고침 버튼
================================================== */

const refreshRoomHistoryBtn =
  document.querySelector("#refreshRoomHistoryBtn");

if (refreshRoomHistoryBtn) {

  refreshRoomHistoryBtn.onclick =
    async () => {

      await loadRoomHistory();

    };

}