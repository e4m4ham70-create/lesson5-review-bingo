import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDoc, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { questions } from "./questions.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let room = "";
let sid = "";
let identity = {};
let studentRef = null;
let answers = {};
let board = Array(16).fill(null);
let marked = new Set();
let selectedToken = null;
let gameStarted = false;

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const cleanRoom = s => s.trim().toUpperCase().replace(/[^A-Z0-9_-]/g,"");
/* ==================================================
   게임 시작 후 편집 잠금
================================================== */

function editingLocked() {

  if (!gameStarted) {
    return false;
  }

  alert(
    "이미 빙고 게임이 시작되었습니다.\n문제 답과 빙고판은 더 이상 수정할 수 없습니다."
  );

  return true;
}


function updateGameLock() {

  const locked = gameStarted;


  // 1. 문제 답 입력창 잠금
  document
    .querySelectorAll("#questionList input")
    .forEach(input => {

      input.disabled = locked;

    });


  // 2. 주요 편집 버튼 잠금
  [
    "#saveAnswers",
    "#shuffleBtn",
    "#clearBtn",
    "#saveBoardBtn"
  ].forEach(selector => {

    const button =
      document.querySelector(selector);

    if (!button) return;


    button.disabled = locked;


    if (locked) {

      button.style.opacity = "0.45";
      button.style.cursor = "not-allowed";

    } else {

      button.style.opacity = "";
      button.style.cursor = "";

    }

  });


  // 3. 빙고판에 배치할 문항 버튼 잠금
  document
    .querySelectorAll("#tokenPool .token")
    .forEach(token => {

      token.style.pointerEvents =
        locked ? "none" : "";

      token.style.opacity =
        locked ? "0.5" : "";

    });


  // 4. 빙고판 편집 칸 잠금
  document
    .querySelectorAll("#buildGrid .cell")
    .forEach(cell => {

      cell.style.pointerEvents =
        locked ? "none" : "";

      cell.style.opacity =
        locked ? "0.7" : "";

    });


  // 5. 안내 문구
  if (locked) {

    const status =
      document.querySelector("#buildStatus");

    if (status) {

      status.textContent =
        "🔒 빙고 게임이 시작되었습니다. 빙고판은 더 이상 수정할 수 없습니다.";

    }

  }

}

await signInAnonymously(auth);

$("#joinBtn").onclick = async () => {
  room = cleanRoom($("#roomCode").value);
  const no = $("#studentNo").value.trim();
  const name = $("#studentName").value.trim();
  if (!room || !no || !name) return alert("학급 코드, 번호, 이름을 모두 입력하세요.");

  // 같은 반에서 번호를 고유 식별자로 사용
  sid = no.replace(/[^0-9A-Za-z가-힣_-]/g,"");
  identity = { no, name };
  studentRef = doc(db, "rooms", room, "students", sid);

  const snap = await getDoc(studentRef);
  if (snap.exists()) {
    const d = snap.data();
    answers = d.answers || {};
    board = Array.isArray(d.board) && d.board.length === 16 ? d.board : Array(16).fill(null);
    marked = new Set(d.marked || []);
  } else {
    await setDoc(studentRef, {
      no, name, answers:{}, board:Array(16).fill(null), marked:[],
      bingoLines:0, answeredCount:0, placedCount:0, updatedAt:serverTimestamp()
    });
  }

  // 이름은 현재 입력값으로 갱신
  await setDoc(studentRef, { no, name, updatedAt:serverTimestamp() }, { merge:true });

  $("#joinCard").classList.add("hidden");
  $("#app").classList.remove("hidden");
  $("#identity").textContent = `학급 ${room} · ${no}번 ${name}`;
  renderQuestions();
  listenTeacherCall();
};

document.querySelectorAll(".tab").forEach(btn => btn.onclick = () => goTab(btn.dataset.tab));
function goTab(id){
  ["solve","build","play"].forEach(x=>$("#"+x).classList.add("hidden"));
  $("#"+id).classList.remove("hidden");
  document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active", b.dataset.tab===id));
  if(id==="build") renderBuilder();
  if(id==="play") renderPlay();
}

function renderQuestions(){
  const root=$("#questionList"); root.innerHTML="";
  questions.forEach(q=>{
    const el=document.createElement("div"); el.className="q-card";
    el.innerHTML=`<div class="q-no">Q${q.n}</div><div class="q-text">${q.q}</div>
      <input id="ans-${q.n}" value="${esc(answers[q.n] || "")}" placeholder="정답 입력">`;
    root.appendChild(el);
  });

  // 게임 시작 여부에 따라 입력창 잠금
  updateGameLock();
}

$("#saveAnswers").onclick = async () => {
  if (editingLocked()) return;
  questions.forEach(q => answers[q.n] = $("#ans-"+q.n).value.trim());

  // 지운 답은 기존 빙고판에서도 제거
  board = board.map(slot => {
    if(!slot || slot.type==="free") return slot;
    const a=(answers[slot.n]||"").trim();
    return a ? {...slot, answer:a} : null;
  });

  const answeredCount = questions.filter(q => (answers[q.n]||"").trim()).length;
  await sync({answers, board, answeredCount, placedCount:board.filter(x=>x&&x.type==="q").length});
  alert(`${answeredCount}개 문항의 답을 저장했습니다.`);
};

function tokens(){
  return [
    ...questions.filter(q => (answers[q.n]||"").trim()).map(q=>({
      id:`q${q.n}`, type:"q", n:q.n, answer:answers[q.n].trim()
    })),
    {id:"free", type:"free", answer:"FREE"}
  ];
}

function renderBuilder(){
  const all=tokens(), pool=$("#tokenPool"); pool.innerHTML="";
  all.forEach(t=>{
    const b=document.createElement("button");
    b.className="token";
    b.textContent=t.type==="free" ? "FREE" : `Q${t.n} · ${t.answer}`;
    if(board.some(x=>x?.id===t.id)) b.classList.add("used");
    if(selectedToken===t.id) b.classList.add("selected");
    b.onclick = () => {

  // 게임이 시작되면 문항 선택 금지
  if (editingLocked()) return;

  if (b.classList.contains("used")) return;

  selectedToken =
    selectedToken === t.id
      ? null
      : t.id;

  renderBuilder();

};
    pool.appendChild(b);
  });
  if(all.length===1){
    pool.innerHTML += `<div class="status">먼저 문제를 한 문제 이상 풀고 답을 저장하세요.</div>`;
  }

  const grid=$("#buildGrid"); grid.innerHTML="";
  board.forEach((slot,i)=>{
    const c=document.createElement("div");
    c.className=`cell ${slot?"filled":"empty"} ${slot?.type==="free"?"free":""}`;
    c.innerHTML=!slot?"빈칸":slot.type==="free"?"FREE":`<div><span class="small">Q${slot.n}</span>${esc(slot.answer)}</div>`;
    c.onclick = () => {

  // 게임이 시작되면 빙고판 칸 수정 금지
  if (editingLocked()) return;

  if (slot) {
    board[i] = null;
    selectedToken = null;
  }

  else if (selectedToken) {

    const t =
      all.find(
        x => x.id === selectedToken
      );

    if (t) {
      board[i] = t;
    }

    selectedToken = null;
  }

  renderBuilder();
};
    grid.appendChild(c);
  });
  const answered=questions.filter(q=>(answers[q.n]||"").trim()).length;
  const placed=board.filter(x=>x?.type==="q").length;
  const free=board.some(x=>x?.type==="free");
  $("#buildStatus").textContent=`답 입력 ${answered}개 · 배치 ${placed}개 · FREE ${free?"배치됨":"미배치"} · 남는 칸은 비워 둘 수 있습니다.`;
// 게임이 시작되었다면 편집 기능 다시 잠금
updateGameLock();
}

$("#shuffleBtn").onclick=()=>{
  if (editingLocked()) return;
  const arr=tokens();
  for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];}
  board=[...arr,...Array(Math.max(0,16-arr.length)).fill(null)].slice(0,16);
  for(let i=15;i>0;i--){const j=Math.floor(Math.random()*(i+1));[board[i],board[j]]=[board[j],board[i]];}
  selectedToken=null; renderBuilder();
};
$("#clearBtn").onclick = () => {

  if (editingLocked()) return;

  board = Array(16).fill(null);

  selectedToken = null;

  renderBuilder();

};

$("#saveBoardBtn").onclick=async()=>{
  if (editingLocked()) return;
  const placed=board.filter(x=>x?.type==="q").length;
  const free=board.filter(x=>x?.type==="free").length;
  if(placed===0) return alert("답을 입력한 문항을 한 개 이상 배치하세요.");
  if(free!==1) return alert("FREE 칸을 정확히 한 개 배치하세요.");
  marked.clear();
  await sync({board, marked:[], placedCount:placed, bingoLines:0});
  alert("빙고판을 저장했습니다.");
  goTab("play");
};

const lines=()=>{
  const a=[];
  for(let r=0;r<4;r++) a.push([4*r,4*r+1,4*r+2,4*r+3]);
  for(let c=0;c<4;c++) a.push([c,c+4,c+8,c+12]);
  a.push([0,5,10,15],[3,6,9,12]);
  return a;
};
function completedLines(){
  return lines().filter(line=>line.every(i=>board[i] && marked.has(i)));
}
function renderPlay(){
  const grid=$("#playGrid"); grid.innerHTML="";
  const completed=completedLines();
  board.forEach((slot,i)=>{
    const c=document.createElement("div");
    if(!slot){c.className="cell empty";c.textContent="빈칸";grid.appendChild(c);return;}
    c.className=`cell filled ${slot.type==="free"?"free":""} ${marked.has(i)?"marked":""}`;
    if(completed.some(line=>line.includes(i))) c.classList.add("line");
    c.innerHTML=slot.type==="free"?"FREE":`<div><span class="small">Q${slot.n}</span>${esc(slot.answer)}</div>`;
    c.onclick=async()=>{
      marked.has(i)?marked.delete(i):marked.add(i);
      const n=completedAfterToggle();
      await sync({marked:[...marked], bingoLines:n});
      renderPlay();
    };
    grid.appendChild(c);
  });
  const n=completed.length;
  $("#bingoStatus").textContent=n>=2?`🎉 BINGO! ${n}줄 완성!`:`현재 완성된 빙고: ${n}줄 / 목표: 2줄`;
}
function completedAfterToggle(){return completedLines().length;}

$("#resetMarks").onclick=async()=>{
  marked.clear(); await sync({marked:[],bingoLines:0}); renderPlay();
};

function listenTeacherCall(){
   onSnapshot(
    doc(db, "rooms", room),

    snap => {

      if (!snap.exists()) return;


      const d = snap.data();

      // 교사가 문제 추첨을 시작했는지 확인
gameStarted = d.gameStarted === true;

// 학생 문제 풀이와 빙고판 편집 상태 변경
updateGameLock();
 
      // 아직 문제가 추첨되지 않은 경우
      if (!d.currentDraw) {

        $("#currentCall").textContent =
          "아직 선생님이 문항을 추첨하지 않았습니다.";

        return;

      }


      const x = d.currentDraw;


      // 정답이 아직 공개되지 않은 경우
      if (x.revealed !== true) {

        $("#currentCall").innerHTML = `

          <b>
            선생님 추첨: Q${x.n}
          </b>

          <br><br>

          ${esc(x.q)}

          <br><br>

          <span
            style="
              font-size:18px;
              color:#6b7280;
              font-weight:800;
            "
          >
            정답을 생각해 보세요!
          </span>

        `;

      }


      // 교사가 정답 보기를 누른 경우
      else {

        $("#currentCall").innerHTML = `

          <b>
            선생님 추첨: Q${x.n}
          </b>

          <br><br>

          ${esc(x.q)}

          <br><br>

          <span
            style="
              font-size:26px;
              color:#5b21b6;
              font-weight:900;
            "
          >
            정답: ${esc(x.a)}
          </span>

        `;

      }

    }
  );

}

async function sync(extra={}){
  if(!studentRef) return;
  const n=completedLines().length;
  await setDoc(studentRef,{
    no:identity.no,name:identity.name,
    ...extra,
    bingoLines:extra.bingoLines ?? n,
    updatedAt:serverTimestamp()
  },{merge:true});
}
