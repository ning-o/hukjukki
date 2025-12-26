/**
 * @fileoverview 메랜 흑적기 MVP - 사냥 정산 및 버프 타이머 통합 관리 스크립트
 * @description 1. 포션 및 스킬 데이터 관리 2. 사냥 데이터 정산 3. PIP 연동 버프 타이머 4. 사냥 시간 사용자 설정 기능 추가
 * @kind Logic/Interface Script
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
    "사이다": { max: 1, data: (l) => ({ t: 300 }) },
    "커스텀(직접입력)": { max: 3600, data: (l) => ({ t: l }) }
};

let totalExp = 0; 
let expHistory = []; 
let totalProfit = 0; 
let profitHistory = []; 
let pipWindow = null; 
let huntInterval = null; 
let isHunting = false; 

// ==========================================
// 2. 초기화 및 UI 이벤트 바인딩 (Initialization)
// ==========================================

window.onload = () => {
    initPotionSelect();
    initBuffSelect();
    initAutoSelect();

    const pBtn = document.getElementById('pipBtn');
    if(pBtn) pBtn.onclick = togglePip;

    const mainLogo = document.getElementById('mainLogo');
    if (mainLogo) {
        mainLogo.addEventListener('click', () => {
            location.reload();
        });
    }
};

function initAutoSelect() {
    const inputs = document.querySelectorAll('input[type="number"]');
    inputs.forEach(input => {
        input.addEventListener('focus', function() { this.select(); });
        input.addEventListener('blur', function() { if (this.value === "") this.value = 0; });
    });
}

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

function updateLevelOptions(sel) {
    const group = sel.closest('.buff-input-group');
    const skillName = sel.value;
    const skill = skillDB[skillName];

    if (skillName === "커스텀(직접입력)") {
        sel.closest('.buff-input-group').querySelector('.buff-level').outerHTML = `
            <div class="custom-time-group buff-level">
                <input type="number" class="custom-min" placeholder="분" min="0" max="60">
                <input type="number" class="custom-sec" placeholder="초" min="0" max="59">
            </div>
        `;
    } else {
        const currentLevelElem = group.querySelector('.buff-level');
        if (currentLevelElem.tagName === 'DIV') {
            currentLevelElem.outerHTML = `<select class="buff-level"></select>`;
        }
        
        const lSel = group.querySelector('.buff-level');
        lSel.innerHTML = '';
        for(let i = skill.max; i >= 1; i--) {
            lSel.add(new Option(`Lv.${i} (${skill.data(i).t}초)`, i));
        }
    }
}

// ==========================================
// 4. 버프 타이머 로직 (Buff Timer)
// ==========================================

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
    const warnTime = warnInput.value || 30;
    
    let skillLevel;
    let displayInfo;

    if (skillName === "커스텀(직접입력)") {
        const group = document.querySelector('.custom-time-group');
        const min = parseInt(group.querySelector('.custom-min').value) || 0;
        const sec = parseInt(group.querySelector('.custom-sec').value) || 0;
        skillLevel = (min * 60) + sec;
        if (skillLevel <= 0) {
            alert("시간을 입력해주십시오.");
            return;
        }
        displayInfo = `${min}분 ${sec}초`;
    } else {
        skillLevel = levelSelect.value;
        displayInfo = `Lv.${skillLevel}`;
    }

    const newEntry = document.createElement('div');
    newEntry.className = 'registered-buff-item';
    newEntry.dataset.timerId = "";
    newEntry.dataset.remainingTime = "";
    newEntry.style = "background: rgba(255,255,255,0.08); padding: 10px; border-radius: 8px; margin-bottom: 8px; border-left: 5px solid #60a3bc; display: flex; justify-content: space-between; align-items: center;";
    
    newEntry.innerHTML = `
    <div style="text-align: left;">
        <div style="font-weight: bold; color: #fff; font-size: 14px;">${skillName}</div>
        <div style="font-size: 11px; color: #60a3bc;">${displayInfo} (${warnTime}s)</div>
    </div>
    <div style="display: flex; gap: 4px; align-items: center;">
        <div class="timer-display" style="font-family: monospace; color: #2ecc71; font-weight: bold; font-size: 13px; margin-right: 4px;">대기</div>
        <button class="play-btn" onclick="startSpecificTimer(this, '${skillName}', ${skillLevel}, ${warnTime})" style="background: #27ae60; color: white; border: none; padding: 5px 8px; border-radius: 4px; cursor: pointer; font-size: 12px;">▶</button>
        <button class="pause-btn" onclick="pauseSpecificTimer(this)" style="background: #e67e22; color: white; border: none; padding: 5px 8px; border-radius: 4px; cursor: pointer; font-size: 12px; display: none;">Ⅱ</button>
        <button class="restart-btn" onclick="restartSpecificTimer(this, '${skillName}', ${skillLevel}, ${warnTime})" style="background: #3498db; color: white; border: none; padding: 5px 8px; border-radius: 4px; cursor: pointer; font-size: 12px;">↻</button>
        <button class="delete-btn" onclick="this.closest('.registered-buff-item').remove(); updatePipWindow();" style="background: #c0392b; color: white; border: none; padding: 5px 8px; border-radius: 4px; cursor: pointer; font-size: 12px;">X</button>
    </div>
`;
    previewList.appendChild(newEntry);
    updatePipWindow();
}

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
            if (isHunting) { 
                time = fullTime;
                item.dataset.remainingTime = time;
                display.style.color = "#3498db";
                setTimeout(() => { display.style.color = "#2ecc71"; }, 500);
            } else { 
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

function pauseSpecificTimer(btn) {
    const item = btn.closest('.registered-buff-item');
    const timerId = item.dataset.timerId;
    const remainingTime = parseInt(item.dataset.remainingTime);

    if (timerId) {
        clearInterval(parseInt(timerId));
        item.dataset.timerId = "";
        const display = item.querySelector('.timer-display');
        const min = Math.floor(remainingTime / 60);
        const sec = remainingTime % 60;
        display.innerText = `${min}m ${sec}s`;
        display.style.color = "#e67e22";
        item.querySelector('.pause-btn').style.display = 'none';
        item.querySelector('.play-btn').style.display = 'inline-block';
        updatePipWindow();
    }
}

function setupPipCloseListener(pipWindow) {
    pipWindow.addEventListener("pagehide", (event) => {
        const pauseButtons = document.querySelectorAll('.pause-btn');
        pauseButtons.forEach(btn => {
            if (btn.style.display !== 'none') {
                pauseSpecificTimer(btn);
            }
        });
        console.log("PIP 창 종료로 인해 모든 타이머 정지");
    });
}

function restartSpecificTimer(btn, name, level, warn) {
    const item = btn.closest('.registered-buff-item');
    const currentTimerId = item.dataset.timerId;
    if (currentTimerId) {
        clearInterval(parseInt(currentTimerId));
        item.dataset.timerId = "";
    }
    item.removeAttribute('data-remaining-time'); 
    item.querySelector('.pause-btn').style.display = 'none';
    const playBtn = item.querySelector('.play-btn');
    playBtn.style.display = 'inline-block';
    startSpecificTimer(playBtn, name, level, warn);
}

// ==========================================
// 5. 사냥 정산 및 리포트 (Calculation)
// ==========================================

/**
 * [Logic Modification] 사용자 입력 시간에 따른 사냥 리포트 시작 로직
 * @description 입력창(hunt-duration-input)에서 분을 가져와 초로 환산하여 사냥을 시작함
 */
function startHunting() {
    isHunting = true;
    const mainBtn = document.getElementById('mainBtn');
    const timerDisplay = document.getElementById('timerDisplay');
    
    // 1. 패널의 입력값 확인 (없거나 오류 시 60분 기본값)
    const durationInput = document.getElementById('hunt-duration-input');
    const durationMin = (durationInput && durationInput.value > 0) ? parseInt(durationInput.value) : 60;
    let timeLeft = durationMin * 60; 

    // 2. 설정 패널 자동 닫기 (사냥 집중을 위해)
    const panel = document.getElementById('hunt-setting-panel');
    if (panel) panel.classList.add('hidden');

    timerDisplay.classList.remove('hidden');

    huntInterval = setInterval(() => {
        timeLeft--;
        const m = Math.floor(timeLeft / 60);
        const s = timeLeft % 60;
        timerDisplay.innerText = `사냥 중... ${m}:${s < 10 ? '0' + s : s}`;
        if (timeLeft <= 0) finishHunting();
    }, 1000);

    mainBtn.innerText = "사냥 종료";
    mainBtn.style.background = "#c0392b";
    mainBtn.onclick = finishHunting;
}


function toggleHuntSetting() {
    const panel = document.getElementById('hunt-setting-panel');
    const btn = document.getElementById('toggle-hunt-setting');
    if (panel.classList.contains('hidden')) {
        panel.classList.remove('hidden');
        btn.innerText = "▲ 설정 닫기";
        btn.style.color = "#27ae60";
    } else {
        panel.classList.add('hidden');
        btn.innerText = "⚙️ 사냥 시간 사용자 설정";
        btn.style.color = "#8fa0b3";
    }
}

function finishHunting() {
    clearInterval(huntInterval);
    isHunting = false;
    const btn = document.getElementById('mainBtn');
    const disp = document.getElementById('timerDisplay');
    const afterS = document.getElementById('section-after');
    const isSimple = !document.getElementById('mesoBefore').value && !document.getElementById('hpBefore').value;

    if (isSimple) {
        btn.innerText = "사냥 시작"; btn.style.background = ""; btn.onclick = startHunting;
        disp.classList.add('hidden');
    } else {
        btn.innerText = "데이터 수집 완료"; btn.disabled = true;
        afterS.classList.remove('hidden'); afterS.scrollIntoView({ behavior: 'smooth' });
    }
}

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
    
    const currentExp = Number(document.getElementById('expGain').value) || 0;
    if (currentExp > 0) { totalExp += currentExp; expHistory.push(currentExp); }
    totalProfit += profit; profitHistory.push(profit);

    renderReportUI(profit, netMeso, iV, hpCost, mpCost, bM, totalCost, unit);
}

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

function prepareNextHunt() {
    document.getElementById('mesoBefore').value = document.getElementById('mesoAfter').value;
    document.getElementById('hpBefore').value = document.getElementById('hpAfter').value;
    document.getElementById('mpBefore').value = document.getElementById('mpAfter').value;
    document.getElementById('mesoAfter').value = "";
    document.getElementById('itemsValue').value = "0";
    document.getElementById('hpAfter').value = "";
    document.getElementById('mpAfter').value = "";
    document.getElementById('expGain').value = "";
    document.getElementById('section-after').classList.add('hidden');
    document.getElementById('result').classList.add('hidden');
    document.getElementById('resetBtn').classList.add('hidden');
    document.getElementById('timerDisplay').classList.add('hidden');
    const mainBtn = document.getElementById('mainBtn');
    mainBtn.disabled = false; mainBtn.innerText = "사냥 시작"; mainBtn.style.background = ""; mainBtn.onclick = startHunting;
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ==========================================
// 6. PIP 시스템 연동 (Picture-in-Picture)
// ==========================================

function updatePipWindow() {
    if (!pipWindow || pipWindow.closed) return;

    if (!pipWindow.hasUnloadListener) {
        pipWindow.addEventListener("unload", () => {
            const pauseButtons = document.querySelectorAll('.pause-btn');
            pauseButtons.forEach(btn => {
                if (btn.style.display !== 'none') {
                    pauseSpecificTimer(btn);
                }
            });
            console.log("PIP 종료: 모든 타이머를 정지 기상 잡았습니다!");
        });
        pipWindow.hasUnloadListener = true;
    }

    const previewList = document.getElementById('pip-preview-list');
    const pipDoc = pipWindow.document;
    let container = pipDoc.getElementById('pip-main-content');
    
    if (!container) {
        container = pipDoc.createElement('div');
        container.id = 'pip-main-content';
        pipDoc.body.appendChild(container);
    }
    
    container.innerHTML = previewList ? previewList.innerHTML : "";
    
    container.querySelectorAll('.registered-buff-item').forEach((pipItem, idx) => {
        const mainItem = previewList.querySelectorAll('.registered-buff-item')[idx];
        if (!mainItem) return;
        
        const pipBtns = pipItem.querySelectorAll('button');
        const mainBtns = mainItem.querySelectorAll('button');
        
        if (pipBtns[0]) pipBtns[0].onclick = () => mainBtns[0].click(); 
        if (pipBtns[1]) pipBtns[1].onclick = () => mainBtns[1].click(); 
        if (pipBtns[2]) pipBtns[2].onclick = () => mainBtns[2].click(); 
        if (pipBtns[3]) pipBtns[3].onclick = () => mainBtns[3].click(); 
    });
}

async function togglePip() {
    if (window.pipWindowInstance) {
        window.pipWindowInstance.close();
        window.pipWindowInstance = null;
        return;
    }
    try {
        const pip = await window.documentPictureInPicture.requestWindow({ width: 300, height: 400 });
        window.pipWindowInstance = pip; pipWindow = pip;
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
    } catch (err) { console.error("PIP 실행 실패: ", err); }
}