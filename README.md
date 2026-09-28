# Reading BINGO - Firebase + GitHub Pages

학생용과 교사용 화면이 분리되어 있지만 Firebase Firestore를 통해 실시간으로 연동되는 Reading BINGO 웹앱입니다.

## 구조
- `index.html` : 학생용
- `teacher.html` : 교사용
- `css/style.css` : 공통 디자인
- `js/firebase-config.js` : Firebase 설정값
- `js/questions.js` : 15문항 / 교사용 정답
- `js/student.js` : 학생용 로직
- `js/teacher.js` : 교사용 로직
- `firestore.rules` : 수업용 기본 Firestore 보안 규칙

## 주요 기능

### 학생
1. 학급 코드 / 번호 / 이름 입력
2. Q1~Q15 답 직접 입력
3. 답을 입력한 문항만 가지고 4×4 빙고판 구성
4. FREE 1칸을 원하는 곳에 배치
5. 교사가 랜덤 추첨한 문항을 실시간으로 확인
6. 학생이 해당 빙고 칸을 직접 체크
7. 2줄 이상 완성 시 BINGO
8. 자신의 진행 상황과 빙고 결과를 Firestore에 자동 저장

### 교사
1. 학급 코드 생성/입력
2. Q1~Q15 중 아직 뽑히지 않은 문항 랜덤 추첨
3. 현재 추첨 문항과 정답을 학생 화면에 실시간 전송
4. 참여 학생 목록 확인
5. 학생별 문제 풀이 수, 빙고판 배치 수, 완성 빙고 줄 수 확인
6. 학생의 실제 빙고판 열어보기
7. 추첨 기록 초기화

---

# 1. Firebase 프로젝트 만들기

1. https://console.firebase.google.com 에서 프로젝트 생성
2. `Firestore Database` 생성
3. `Authentication` → `Sign-in method` → `Anonymous` 활성화
4. 프로젝트 설정 → `웹 앱 추가`
5. Firebase가 보여주는 `firebaseConfig` 값을 복사
6. `js/firebase-config.js` 안의 값을 자신의 프로젝트 값으로 교체

예:
```js
export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.firebasestorage.app",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

# 2. Firestore Rules 설정

Firebase Console → Firestore Database → Rules에서 이 프로젝트의 `firestore.rules` 내용을 붙여넣고 Publish 합니다.

이 샘플은 **수업용 간편 운영**을 우선한 규칙입니다. 학급 코드를 아는 사용자가 해당 학급 데이터에 접근할 수 있으므로, 민감한 개인정보는 입력하지 않는 것을 권장합니다.

# 3. VS Code에서 실행

ES module을 사용하기 때문에 HTML 파일을 파일 탐색기에서 더블클릭하기보다는 로컬 서버로 여는 것이 좋습니다.

VS Code의 `Live Server` 확장 프로그램을 설치한 뒤:
- `index.html` 우클릭 → Open with Live Server

학생용:
- `http://127.0.0.1:5500/index.html`

교사용:
- `http://127.0.0.1:5500/teacher.html`

# 4. GitHub Pages에 게시

1. GitHub에서 새 repository 생성
2. 이 폴더의 모든 파일 업로드/Push
3. Repository → Settings → Pages
4. Build and deployment → Deploy from a branch
5. `main` / `/root` 선택
6. 저장

게시 후:
- 학생: `https://아이디.github.io/저장소명/`
- 교사: `https://아이디.github.io/저장소명/teacher.html`

# 5. 실제 수업 운영

1. 교사가 `teacher.html` 접속
2. 학급 코드 입력 (예: `L4-101`)
3. 학생들에게 학생용 주소와 학급 코드 안내
4. 학생은 번호와 이름을 입력하고 입장
5. 학생이 문제 풀이 → 답 저장
6. 학생이 답을 입력한 문항 + FREE로 빙고판 꾸미기
7. 교사가 랜덤 추첨
8. 교사 화면의 문항/정답이 학생 화면에 실시간 표시
9. 학생은 자기 빙고판에서 해당 칸을 직접 체크
10. 교사는 학생 현황에서 빙고 달성 여부 확인

## 참고
현재 버전은 학생이 입력한 답이 맞는지 자동 채점하지 않습니다. 즉, 학생이 본문을 보고 작성한 답을 그대로 빙고판에 사용하도록 설계되어 있습니다.
