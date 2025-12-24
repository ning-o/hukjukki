/**
 * @fileoverview 메랜 흑적기 MVP - 사냥 정산 및 버프 타이머 통합 관리 스크립트
 * @description 1. 포션 및 스킬 데이터 관리 2. 사냥 데이터 정산 3. PIP 연동 버프 타이머
 */

// ==========================================
// 1. 전역 설정 및 데이터베이스 (Database)
// ==========================================

const potions = {
    HP: { '빨간포션': 50, '주황포션': 160, '하얀포션': 320, '장어구이': 1060, '쭈쭈바': 2300, '치즈': 4500, '우유': 5600, '라면' : 1100, '키노코라면(구운돼지)': 1600, '키노코라면(돼지사골)': 850, '키노코라면(소금)' : 550, '길핫': 304, '통닭': 209, '뚱핫': 503, '사과': 40 },
    MP: { '파란포션': 200, '마엘': 620, '맑은물': 1650, '팥빙수': 4000, '새벽이슬': 7695, '황혼이슬': 9690, '오렌지주스': 800, '포도주스': 1700 },
    BOTH: { '오렌지': 97, '엘릭서': 10000, '파엘': 20000, '수박': 3200 }
};

const skillDB = {
    "홀리심볼": { max: 30, data: (l) => ({ t: l <= 10 ? 10 + l * 5 : (l <= 20 ? 60 + (l - 10) * 3 : 90 + (l - 20) * 3) }) },
    "샤프아이즈": { max: 30, data: (l) => ({ t: l * 10 }) },
    "분노": { max: 20, data: (l) => ({ t: l * 8 }) },
    "메이플용사": { max: 20, data: (l) => ({ t: l * 30 }) },
    "하이퍼바디": { max: 30, data: (l) => ({ t: 5 + l * 5 }) },
    "메소업": { max: 20, data: (l) => ({ t: 20 + l * 5 }) },
    "사이다": { max: 1, data: (l) => ({ t: 300 }) }
};

// 시스템 상태 변수
let totalExp = 0;           // 누적 경험치
let expHistory = [];        // 경험치 히스토리
let totalProfit = 0;        // 누적 손익
let profitHistory = [];     // 손익 히스토리
let pipWindow = null;       // PIP 창 객체
let huntInterval = null;    // 사냥 타이머 인터벌
let isHunting = false;      // 사냥 진행 여부

// ==========================================
// 2. 초기화 및 UI 이벤트 바인딩 (Initialization)
// ==========================================

window.onload = () => {
    initPotionSelect();      // 포션 선택 목록 초기화
    initBuffSelect();        // 버프 스킬 목록 초기화
    initAutoSelect();        // [신규] 입력창 자동 선택 기능 활성화
    
    const pBtn = document.getElementById('pipBtn');
    if(pBtn) pBtn.onclick = togglePip;
};

/**
 * [UI Function] 모든 숫자 입력창에 자동 선택 및 복구 기능 활성화
 */
function initAutoSelect() {
    const inputs = document.querySelectorAll('input[type="number"]');
    inputs.forEach(input => {
        // 클릭 시 기존 값 전체 선택 (0을 지울 필요 없게 함)
        input.addEventListener('focus', function() {
            this.select();
        });
        // 입력 없이 나갈 경우 기본값 0으로 복구
        input.addEventListener('blur', function() {
            if (this.value === "") this.value = 0;
        });
    });
}

/**
 * [UI Function] 포션 선택 목록 구성
 */
function initPotionSelect() {
    const hpS = document.getElementById('hpPotion');
    const mpS = document.getElementById('mpPotion');
    if(hpS && mpS) {
        const hList = {...potions.HP, ...potions.BOTH};
        const mList = {...potions.MP, ...potions.BOTH};
        Object.keys(hList).forEach(k => hpS.add(new Option(k, k)));
        Object.keys(mList).forEach(k => mpS.add(new Option(k, k)));
        hpS.value = "쭈쭈바"; mpS.value = "마엘";
    }
}

/**
 * [UI Function] 버프 스킬 및 레벨 목록 초기화
 */
function initBuffSelect() {
    document.querySelectorAll('.buff-name').forEach(sel => {
        sel.innerHTML = ''; 
        Object.keys(skillDB).forEach(name => sel.add(new Option(name, name)));
        updateLevelOptions(sel);
    });
}

// ==========================================
// 3. 유틸리티 함수 (Utility)
// ==========================================

/**
 * [Audio Function] 알림 사운드 재생
 * @param {string} type - 'buff'(버프 갱신), 'finish'(사냥 종료)
 */
function playAlertSound(type) {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const beep = (f, d, t) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.type = t; o.frequency.value = f; g.gain.value = 0.2;
        o.start(); o.stop(ctx.currentTime + d);
    };
    if (type === 'buff') {
        [0, 0.3, 0.6].forEach(d => setTimeout(() => beep(880, 0.15, 'sine'), d * 1000));
    } else if (type === 'finish') {
        [0, 0.4].forEach(d => setTimeout(() => beep(554, 0.2, 'square'), d * 1000));
    }
}

/**
 * [UI Function] 선택한 스킬에 따른 레벨 옵션 동적 업데이트
 */
function updateLevelOptions(sel) {
    const lSel = sel.closest('.buff-input-group').querySelector('.buff-level');
    const skill = skillDB[sel.value];
    lSel.innerHTML = '';
    for(let i = skill.max; i >= 1; i--) {
        lSel.add(new Option(`Lv.${i} (${skill.data(i).t}초)`, i));
    }
}

// ==========================================
// 4. 버프 타이머 로직 (Buff Timer)
// ==========================================

/**
 * [Timer/UI Function] 설정된 버프를 등록 리스트에 추가
 */
function addBuffGroup() {
    const nameSelect = document.querySelector('.buff-name');
    const levelSelect = document.querySelector('.buff-level');
    const warnInput = document.querySelector('.buff-warn');

    if (!nameSelect || !nameSelect.value) {
        alert("스킬을 선택해주십시오.");
        return;
    }

    const previewList = document.getElementById('pip-preview-list');
    if (previewList.innerText.includes("추가된 버프가 없습니다")) {
        previewList.innerHTML = "";
    }

    const skillName = nameSelect.value;
    const skillLevel = levelSelect.value;
    const warnTime = warnInput.value || 30;

    const newEntry = document.createElement('div');
    newEntry.className = 'registered-buff-item';
    newEntry.dataset.timerId = ""; 
    newEntry.dataset.remainingTime = ""; 
    newEntry.style = "background: rgba(255,255,255,0.08); padding: 10px; border-radius: 8px; margin-bottom: 8px; border-left: 5px solid #60a3bc; display: flex; justify-content: space-between; align-items: center;";
    
    newEntry.innerHTML = `
        <div style="text-align: left;">
            <div style="font-weight: bold; color: #fff; font-size: 14px;">${skillName}</div>
            <div style="font-size: 11px; color: #60a3bc;">Lv.${skillLevel} (${warnTime}s)</div>
        </div>
        <div style="display: flex; gap: 4px; align-items: center;">
            <div class="timer-display" style="font-family: monospace; color: #2ecc71; font-weight: bold; font-size: 13px; margin-right: 4px;">대기</div>
            <button class="play-btn" onclick="startSpecificTimer(this, '${skillName}', ${skillLevel}, ${warnTime})" style="background: #27ae60; color: white; border: none; padding: 5px 8px; border-radius: 4px; cursor: pointer; font-size: 12px;">▶</button>
            <button class="pause-btn" onclick="pauseSpecificTimer(this)" style="background: #e67e22; color: white; border: none; padding: 5px 8px; border-radius: 4px; cursor: pointer; font-size: 12px; display: none;">Ⅱ</button>
            <button class="delete-btn" onclick="this.closest('.registered-buff-item').remove(); updatePipWindow();" style="background: #c0392b; color: white; border: none; padding: 5px 8px; border-radius: 4px; cursor: pointer; font-size: 12px;">X</button>
        </div>
    `;

    previewList.appendChild(newEntry);
    updatePipWindow();
}

/**
 * [Timer Function] 개별 버프 타이머 가동 (사냥 중 자동 반복 지원)
 */
function startSpecificTimer(btn, name, level, warn) {
    const item = btn.closest('.registered-buff-item');
    const display = item.querySelector('.timer-display');
    const pauseBtn = item.querySelector('.pause-btn');
    
    const fullTime = skillDB[name].data(level).t;
    let time = item.dataset.remainingTime ? parseInt(item.dataset.remainingTime) : fullTime;
    
    btn.style.display = "none"; 
    pauseBtn.style.display = "inline-block";

    if (item.dataset.timerId) clearInterval(parseInt(item.dataset.timerId));

    const tId = setInterval(() => {
        time--;
        item.dataset.remainingTime = time;

        const m = Math.floor(time / 60);
        const s = time % 60;
        display.innerText = `${m}:${s < 10 ? '0' + s : s}`;

        if (time === Number(warn)) playAlertSound('buff');
        
        if (time <= 0) {
            if (isHunting) { // 사냥 중일 경우 자동 재시작
                time = fullTime;
                item.dataset.remainingTime = time;
                display.style.color = "#3498db"; 
                setTimeout(() => { display.style.color = "#2ecc71"; }, 500);
            } else { // 사냥 종료 시 타이머 정지
                clearInterval(tId);
                item.dataset.timerId = "";
                item.dataset.remainingTime = "";
                display.innerText = "종료";
                display.style.color = "#ff3f34";
                btn.style.display = "inline-block";
                btn.innerText = "▶";
                pauseBtn.style.display = "none";
            }
        }
        updatePipWindow();
    }, 1000);

    item.dataset.timerId = tId;
}

/**
 * [Timer Function] 버프 타이머 일시정지
 */
function pauseSpecificTimer(pauseBtn) {
    const item = pauseBtn.closest('.registered-buff-item');
    const playBtn = item.querySelector('.play-btn');
    const display = item.querySelector('.timer-display');
    
    const tId = item.dataset.timerId;
    if (tId) {
        clearInterval(tId);
        item.dataset.timerId = "";
        pauseBtn.style.display = "none";
        playBtn.style.display = "inline-block";
        playBtn.innerText = "▶";
        display.innerText = "정지";
        updatePipWindow();
    }
}

// ==========================================
// 5. 사냥 정산 및 리포트 (Calculation)
// ==========================================

/**
 * [Main Function] 사냥 세션 시작
 */
function startHunting() {
    isHunting = true;
    const mainBtn = document.getElementById('mainBtn');
    const timerDisplay = document.getElementById('timerDisplay');
    
    let timeLeft = 3600; 
    timerDisplay.classList.remove('hidden');

    huntInterval = setInterval(() => {
        timeLeft--;
        const m = Math.floor(timeLeft / 60);
        const s = timeLeft % 60;
        timerDisplay.innerText = `사냥 중... ${m}:${s < 10 ? '0' + s : s}`;
        
        if (timeLeft <= 0) {
            finishHunting();
        }
    }, 1000);

    mainBtn.innerText = "사냥 종료";
    mainBtn.style.background = "#c0392b";
    mainBtn.onclick = finishHunting;
}

/**
 * [Main Function] 사냥 세션 종료 및 데이터 입력 준비
 */
function finishHunting() {
    clearInterval(huntInterval);
    isHunting = false;
    const btn = document.getElementById('mainBtn');
    const disp = document.getElementById('timerDisplay');
    const afterS = document.getElementById('section-after');
    const isSimple = !document.getElementById('mesoBefore').value && !document.getElementById('hpBefore').value;

    if (isSimple) {
        btn.innerText = "사냥 시작 (1시간)"; btn.style.background = ""; btn.onclick = startHunting;
        disp.classList.add('hidden');
    } else {
        btn.innerText = "데이터 수집 완료"; btn.disabled = true;
        afterS.classList.remove('hidden'); afterS.scrollIntoView({ behavior: 'smooth' });
    }
}

/**
 * [Calculation Function] 입력된 데이터를 바탕으로 손익 리포트 생성
 */
function calculateResult() {
    const unit = 10000;
    const mB = (Number(document.getElementById('mesoBefore').value) || 0) * unit;
    const mA = (Number(document.getElementById('mesoAfter').value) || 0) * unit;
    const iV = (Number(document.getElementById('itemsValue').value) || 0) * unit;
    const moneyType = document.getElementById('moneyType').value;
    const rawMoney = (Number(document.getElementById('bringMoney').value) || 0) * unit;
    
    let bM = (moneyType === 'minus') ? rawMoney : (moneyType === 'plus' ? -rawMoney : 0);

    const allP = {...potions.HP, ...potions.MP, ...potions.BOTH};
    const hpUsed = (Number(document.getElementById('hpBefore').value) || 0) - (Number(document.getElementById('hpAfter').value) || 0);
    const mpUsed = (Number(document.getElementById('mpBefore').value) || 0) - (Number(document.getElementById('mpAfter').value) || 0);
    const hpCost = hpUsed * (allP[document.getElementById('hpPotion').value] || 0);
    const mpCost = mpUsed * (allP[document.getElementById('mpPotion').value] || 0);
    
    const netMeso = mA - mB; 
    const totalCost = hpCost + mpCost + bM; 
    const profit = netMeso + iV - totalCost; 
    
    // 경험치 및 손익 히스토리 누적
    const currentExp = Number(document.getElementById('expGain').value) || 0;
    if (currentExp > 0) { totalExp += currentExp; expHistory.push(currentExp); }
    totalProfit += profit; profitHistory.push(profit);

    renderReportUI(profit, netMeso, iV, hpCost, mpCost, bM, totalCost, unit);
}

/**
 * [UI Function] 계산 결과를 화면에 출력 (HTML 렌더링)
 */
function renderReportUI(profit, netMeso, iV, hpCost, mpCost, bM, totalCost, unit) {
    const format = (v) => (v / unit).toLocaleString() + "만";
    const formatMinus = (v) => v > 0 ? `-${(v / unit).toLocaleString()}만` : "0만";

    const expLines = expHistory.map((v, i) => `<div>${i+1}탐 <strong style="color:#60a3bc;">${v.toLocaleString()}만</strong></div>`).join("");
    const profitLines = profitHistory.map((v, i) => {
        const status = v >= 0 ? "흑자" : "적자";
        return `<div>${i+1}탐 <strong style="color:${v >= 0 ? '#2ecc71' : '#e74c3c'};">${(Math.abs(v) / unit).toLocaleString()}만 ${status}</strong></div>`;
    }).join("");

    const resDiv = document.getElementById('result');
    resDiv.classList.remove('hidden');
    resDiv.innerHTML = `
        <div style="text-align:center;">
            <h3 style="margin-top:0; color:#2f3542;">📊 사냥 결과 리포트</h3>
            <p style="font-size:22px; font-weight:bold; color:${profit>=0?'#2ecc71':'#e74c3c'}; margin:10px 0;">
                사냥 결과: ${format(profit)} 메소 [${profit>=0?'흑자':'적자'}]
            </p>
            <div class="report-grid" style="display: flex; justify-content: space-around; background: #f8f9fa; padding: 10px; border-radius: 8px; font-size: 13px;">
                <div style="flex: 1; border-right: 1px solid #ddd;"><span>순수 메소</span><br><strong>${format(netMeso)}</strong></div>
                <div style="flex: 1; border-right: 1px solid #ddd;"><span>득템 가치</span><br><strong>${format(iV)}</strong></div>
                <div style="flex: 1; border-right: 1px solid #ddd;"><span>포션 비용</span><br><strong class="${hpCost+mpCost > 0 ? 'profit-minus' : ''}">${formatMinus(hpCost + mpCost)}</strong></div>
                <div style="flex: 1;"><span>기타 정산</span><br><strong class="${bM > 0 ? 'profit-minus' : ''}">${formatMinus(bM)}</strong></div>
            </div>
            <div style="margin-top:20px; border-top:2px solid #eee;">
                <div style="font-weight:bold; margin:12px 0; color:#2f3542;">📜 세션 히스토리</div>
                <div style="display: flex; font-size: 13px; line-height: 1.8;">
                    <div style="flex: 1; text-align: center; border-right: 1px dashed #ccc;">${expLines}</div>
                    <div style="flex: 1; text-align: center;">${profitLines}</div>
                </div>
            </div>
        </div>`;
    resDiv.scrollIntoView({ behavior: 'smooth' });
    document.getElementById('resetBtn').classList.remove('hidden');
}

/**
 * [Main Function] 다음 사냥 세션 준비 및 데이터 초기화
 */
function prepareNextHunt() {
    // 종료 데이터를 시작 데이터로 마이그레이션
    document.getElementById('mesoBefore').value = document.getElementById('mesoAfter').value;
    document.getElementById('hpBefore').value = document.getElementById('hpAfter').value;
    document.getElementById('mpBefore').value = document.getElementById('mpAfter').value;
    
    // 입력 필드 초기화
    document.getElementById('mesoAfter').value = "";
    document.getElementById('itemsValue').value = "0";
    document.getElementById('hpAfter').value = "";
    document.getElementById('mpAfter').value = "";
    document.getElementById('expGain').value = "";
    
    // UI 상태 리셋
    document.getElementById('section-after').classList.add('hidden');
    document.getElementById('result').classList.add('hidden');
    document.getElementById('resetBtn').classList.add('hidden');
    document.getElementById('timerDisplay').classList.add('hidden');
    
    const mainBtn = document.getElementById('mainBtn');
    mainBtn.disabled = false;
    mainBtn.innerText = "사냥 시작 (1시간)";
    mainBtn.style.background = "";
    mainBtn.onclick = startHunting;
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ==========================================
// 6. PIP 시스템 연동 (Picture-in-Picture)
// ==========================================

/**
 * [UI Function] PIP 창의 내용을 메인 리스트와 동기화
 */
function updatePipWindow() {
    if (!pipWindow || pipWindow.closed) return;

    const previewList = document.getElementById('pip-preview-list');
    const pipDoc = pipWindow.document;
    
    let container = pipDoc.getElementById('pip-main-content');
    if (!container) {
        container = pipDoc.createElement('div');
        container.id = 'pip-main-content';
        pipDoc.body.appendChild(container);
    }
    container.innerHTML = previewList ? previewList.innerHTML : "";

    // PIP 버튼 이벤트 위임 처리
    container.querySelectorAll('.registered-buff-item').forEach((pipItem, idx) => {
        const mainItem = previewList.querySelectorAll('.registered-buff-item')[idx];
        if (!mainItem) return;
        const pipBtns = pipItem.querySelectorAll('button');
        const mainBtns = mainItem.querySelectorAll('button');
        if (pipBtns[0]) pipBtns[0].onclick = () => mainBtns[0].click();
        if (pipBtns[1]) pipBtns[1].onclick = () => mainBtns[1].click();
    });
}

/**
 * [UI Function] PIP 창 열기/닫기 토글
 */
async function togglePip() {
    if (window.pipWindowInstance) {
        window.pipWindowInstance.close();
        window.pipWindowInstance = null;
        return;
    }

    try {
        const pip = await window.documentPictureInPicture.requestWindow({ width: 300, height: 400 });
        window.pipWindowInstance = pip;
        pipWindow = pip;

        // 초기 스타일 주입
        const style = pip.document.createElement('style');
        style.textContent = `
            body { background: #000; color: white; margin: 0; padding: 10px; font-family: sans-serif; }
            .registered-buff-item { background: rgba(255,255,255,0.1); padding: 10px; border-radius: 8px; margin-bottom: 8px; border-left: 5px solid #60a3bc; display: flex; justify-content: space-between; align-items: center; }
            button { background: #27ae60; color: white; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: bold; }
            .pause-btn { background: #e67e22; } .delete-btn { display: none; }
            .timer-display { font-family: monospace; font-weight: bold; color: #2ecc71; font-size: 14px; }
        `;
        pip.document.head.appendChild(style);

        updatePipWindow();
        pip.addEventListener("pagehide", () => { window.pipWindowInstance = null; pipWindow = null; });
    } catch (err) {
        console.error("PIP 실행 실패: ", err);
    }
}