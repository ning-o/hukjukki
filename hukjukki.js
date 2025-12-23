// =========================
// 1. DB
// =========================
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

let huntTimer; 

// =========================
// 2. 초기화 (window.onload)
// =========================
window.onload = () => {
    // 포션 초기 설정
    const hpS = document.getElementById('hpPotion');
    const mpS = document.getElementById('mpPotion');
    if(hpS && mpS) {
        const hList = {...potions.HP, ...potions.BOTH};
        const mList = {...potions.MP, ...potions.BOTH};
        Object.keys(hList).forEach(k => hpS.add(new Option(k, k)));
        Object.keys(mList).forEach(k => mpS.add(new Option(k, k)));
        hpS.value = "쭈쭈바"; mpS.value = "마엘";
    }

    // 스킬 목록 초기화
    document.querySelectorAll('.buff-name').forEach(sel => {
        sel.innerHTML = ''; 
        Object.keys(skillDB).forEach(name => sel.add(new Option(name, name)));
        updateLevelOptions(sel);
    });

    // PIP 버튼 연결
    const pBtn = document.getElementById('pipBtn');
    if(pBtn) pBtn.onclick = togglePip;
};

// =========================
// 3. 음향 및 유틸리티
// =========================
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
    const lSel = sel.closest('.buff-input-group').querySelector('.buff-level');
    const skill = skillDB[sel.value];
    lSel.innerHTML = '';
    for(let i = skill.max; i >= 1; i--) {
        lSel.add(new Option(`Lv.${i} (${skill.data(i).t}초)`, i));
    }
}

function addBuffGroup() {
    const container = document.getElementById('buff-container');
    const newGroup = container.querySelector('.buff-input-group').cloneNode(true);
    const btn = newGroup.querySelector('.btn-alarm');
    btn.innerText = "알람 시작";
    btn.onclick = function() { startTimer(this); };
    if(newGroup.querySelector('.timer-info-msg')) newGroup.querySelector('.timer-info-msg').remove();
    container.appendChild(newGroup);
    updateLevelOptions(newGroup.querySelector('.buff-name'));
}

// =========================
// 4. 타이머 핵심 로직
// =========================
function startTimer(btn) {
    const g = btn.closest('.buff-input-group');
    const n = g.querySelector('.buff-name').value;
    const l = g.querySelector('.buff-level').value;
    const w = Number(g.querySelector('.buff-warn').value);
    let time = skillDB[n].data(l).t;

    let infoMsg = g.querySelector('.timer-info-msg');
    if (!infoMsg) {
        infoMsg = document.createElement('div');
        infoMsg.className = 'timer-info-msg';
        infoMsg.style.cssText = "font-size:11px; color:#e74c3c; font-weight:bold; margin-bottom:5px; text-align:right; padding-right:5px;";
        infoMsg.innerHTML = "🖱️ 좌: -10초 / 우: 초기화";
        btn.parentNode.insertBefore(infoMsg, btn);
    }

    btn.oncontextmenu = (e) => {
        e.preventDefault(); clearInterval(tId); infoMsg.remove();
        btn.innerText = "알람 시작"; btn.onclick = () => startTimer(btn);
        return false;
    };

    btn.onclick = () => { time = Math.max(0, time - 10); updateText(); };
    const updateText = () => { btn.innerText = `${Math.floor(time/60)}:${time%60 < 10 ? '0'+time%60 : time%60}`; };
    updateText();

    const tId = setInterval(() => {
        if (time > 0) { time--; updateText(); }
        if (time === w && time > 0) playAlertSound('buff');
        if (time <= 0) {
            clearInterval(tId);
            const isHunting = !document.getElementById('timerDisplay').classList.contains('hidden');
            if (isHunting) {
                btn.innerText = "재시작 중...";
                setTimeout(() => { if(infoMsg) infoMsg.remove(); startTimer(btn); }, 100);
            } else {
                if(infoMsg) infoMsg.remove(); btn.innerText = "알람 시작"; btn.onclick = () => startTimer(btn);
            }
        }
    }, 1000);
}

// =========================
// 5. 사냥 및 리포트
// =========================
function startHunting() {
    const btn = document.getElementById('mainBtn');
    const disp = document.getElementById('timerDisplay');
    let count = 3600;
    btn.innerText = "사냥 강제 종료 (즉시 분석)";
    btn.style.background = "linear-gradient(135deg, #e74c3c 0%, #c0392b 100%)";
    btn.onclick = finishHunting;
    disp.classList.remove('hidden');
    
    if (huntTimer) clearInterval(huntTimer);
    huntTimer = setInterval(() => {
        count--;
        const m = Math.floor(count / 60);
        const s = count % 60;
        disp.innerText = `사냥중... ${m}분 ${s < 10 ? '0' + s : s}초 남음`;
        if(count <= 0) { playAlertSound('finish'); finishHunting(); }
    }, 1000);
}

function finishHunting() {
    clearInterval(huntTimer);
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
    
    const profit = (mA - mB) + iV - (hpCost + mpCost + bM);
    const format = (v) => (v / unit).toLocaleString() + "만";

    const resDiv = document.getElementById('result');
    resDiv.classList.remove('hidden');
    resDiv.innerHTML = `<div style="text-align:center; padding:15px; background:#f8f9fa; border-radius:10px;">
        <h3 style="margin-top:0;">📊 사냥 결과 리포트</h3>
        <p style="font-size:20px; font-weight:bold; color:${profit>=0?'#2ecc71':'#e74c3c'};">
            최종 이익: ${format(profit)} 메소 [${profit>=0?'흑자':'적자'}]
        </p>
    </div>`;
    resDiv.scrollIntoView({ behavior: 'smooth' });
    if(document.getElementById('resetBtn')) document.getElementById('resetBtn').classList.remove('hidden');
}

function prepareNextHunt() {
    location.reload(); 
}

// =========================
// 6. PIP 시스템
// =========================
let pipWindow = null;

async function togglePip() {
    // 1. 이미 열려있으면 닫기
    if (pipWindow) {
        pipWindow.close();
        return;
    }

    // 2. 브라우저 지원 확인
    if (!window.documentPictureInPicture) {
        alert("중대장님, 이 기능은 최신 크롬/웨일 브라우저에서만 작동합니다!");
        return;
    }

    try {
        // 3. PIP 창 요청 (기본 크기)
        pipWindow = await window.documentPictureInPicture.requestWindow({
            width: 280,
            height: 80, // 초기 높이는 낮게 시작
        });

        // 4. PIP 창 내부 스타일 설정
        const style = pipWindow.document.createElement('style');
        style.textContent = `
            body { 
                margin: 0; padding: 10px; 
                background-color: black; color: white; 
                font-family: Arial, sans-serif; overflow: hidden;
            }
            .pip-row {
                display: flex; justify-content: space-between; align-items: center;
                margin-bottom: 8px; border-bottom: 1px solid #333; padding-bottom: 5px;
            }
            .buff-name { font-size: 16px; font-weight: bold; }
            .buff-time { font-size: 18px; color: #2ecc71; font-family: monospace; }
            .btn-reset { 
                background: #e74c3c; color: white; border: none; 
                padding: 2px 6px; border-radius: 3px; cursor: pointer; font-size: 11px;
            }
            .no-buff { color: #666; text-align: center; font-size: 14px; margin-top: 10px; }
        `;
        pipWindow.document.head.appendChild(style);

        // 5. 내용물 담을 컨테이너 생성
        const container = pipWindow.document.createElement('div');
        container.id = 'pip-container';
        pipWindow.document.body.appendChild(container);

        // 6. 실시간 업데이트 및 창 크기 조절 로직
        const updateLoop = () => {
            if (!pipWindow) return;

            const mainGroups = document.querySelectorAll('.buff-input-group');
            let activeBuffs = [];

            mainGroups.forEach((g, idx) => {
                const name = g.querySelector('.buff-name').value;
                const timeStr = g.querySelector('.btn-alarm').innerText;
                if (timeStr.includes(':')) {
                    activeBuffs.push({ name, timeStr, idx });
                }
            });

            // 버프 수에 따라 창 높이 자동 계산 (개당 약 40px + 여백)
            const newHeight = activeBuffs.length > 0 ? (activeBuffs.length * 45) + 40 : 80;
            if (Math.abs(pipWindow.innerHeight - newHeight) > 10) {

            }

            let html = '';
            if (activeBuffs.length === 0) {
                html = '<div class="no-buff">가동 중인 버프 없음</div>';
            } else {
                activeBuffs.forEach(buff => {
                    html += `
                        <div class="pip-row">
                            <span class="buff-name">${buff.name}</span>
                            <span class="buff-time">${buff.timeStr}</span>
                            <button class="btn-reset" onclick="window.opener.document.querySelectorAll('.btn-alarm')[${buff.idx}].oncontextmenu(new Event('contextmenu'))">X</button>
                        </div>
                    `;
                });
            }

            container.innerHTML = html;
            requestAnimationFrame(updateLoop);
        };

        updateLoop();

        // 창 닫힐 때 변수 초기화
        pipWindow.onpagehide = () => { pipWindow = null; };

    } catch (e) {
        console.error("PIP 작전 실패:", e);
    }
}
