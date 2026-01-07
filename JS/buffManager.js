/**
 * @file buffManager.js
 * @description 버프 매니저 - 독립 타이머(Interval) 로직 및 메인 컨트롤러 동기화
 */
import { SKILL_DB } from './constants.js';
import { formatTime, playAlertSound } from './utils.js';

export class BuffManager {
    /**
     * 생성자 (Constructor)
     * - 버프 상태 배열 및 내부 타이머 ID 초기화
     */
    constructor() {
        this.pipWindow = null;
        this.buffs = []; // 버프 상태 관리 배열
        this.intervalId = null; // 자체 타이머 ID
        this.initBuffSelect();
    }

    /**
     * 버프 선택 UI 초기화
     * - 스킬 DB(SKILL_DB)를 기반으로 옵션 생성
     * - UI 가시성(Visibility) 토글 처리
     */
    initBuffSelect() {
        const skillSelect = document.querySelector('.buff-name');
        const levelSelect = document.querySelector('.buff-level');
        const defaultUI = document.getElementById('default-skill-ui');
        const customUI = document.getElementById('custom-skill-ui');
        const cancelBtn = document.getElementById('cancel-custom-btn'); // HTML에 있는 ID
        
        if (!skillSelect || !levelSelect) return;

        skillSelect.innerHTML = '';
        Object.keys(SKILL_DB).forEach(skill => {
            const opt = document.createElement('option');
            opt.value = skill;
            opt.textContent = skill;
            skillSelect.appendChild(opt);
        });

        skillSelect.onchange = () => {
            const skillName = skillSelect.value;
            if (skillName === "(직접입력)") {
                defaultUI.classList.add('hidden');
                customUI.classList.remove('hidden');
                cancelBtn?.classList.remove('hidden');
            } else {
                defaultUI.classList.remove('hidden');
                customUI.classList.add('hidden');
                cancelBtn?.classList.add('hidden');

                levelSelect.innerHTML = "";
                const skillInfo = SKILL_DB[skillName];
                if (skillInfo) {
                    for (let i = 1; i <= skillInfo.max; i++) {
                        const opt = document.createElement('option');
                        opt.value = i;
                        const duration = typeof skillInfo.data === 'function' ? skillInfo.data(i).t : 0;
                        opt.textContent = `Lv.${i}(${duration}초)`;
                        if (i === skillInfo.max) opt.selected = true;
                        levelSelect.appendChild(opt);
                    }
                }
            }
        };

        // '목록 다시 선택' 버튼에 클릭 이벤트(onclick) 연결
        if (cancelBtn) {
            cancelBtn.onclick = () => {
                // 1. 선택 목록을 맨 처음(보통 일반 스킬)으로 돌려놓음
                skillSelect.selectedIndex = 0;
                // 2. 'change' 이벤트를 강제로 발생시켜 UI를 '직접입력'에서 '일반'으로 갱신시킴
                skillSelect.dispatchEvent(new Event('change'));
            };
        }

        // 초기 실행
        skillSelect.dispatchEvent(new Event('change'));
    }

    /**
     * 내부 타이머 루프 시작
     * - 활성화된 버프가 하나라도 있을 경우 1초 단위 인터벌 실행
     */
    startInternalTimer(mainInstance) {
        if (this.intervalId) return; // 이미 실행 중이면 중복 실행 방지

        this.intervalId = setInterval(() => {
            this.tick(mainInstance);
        }, 1000);
    }

    /**
     * 내부 타이머 루프 정지
     * - 실행 중인 버프가 하나도 없으면 인터벌 제거 (리소스 절약)
     */
    stopInternalTimer() {
        if (!this.intervalId) return;
        
        const hasRunningBuff = this.buffs.some(b => b.isRunning);
        if (!hasRunningBuff) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    /**
     * 버프 그룹 추가 핸들러
     * - UI 입력값을 파싱하여 새로운 버프 상태 객체 생성
     * - 사냥 중일 경우 즉시 시작(Auto Start)
     */
    addBuffGroup(mainInstance) {
        const nameSelect = document.querySelector('.buff-name');
        const levelSelect = document.querySelector('.buff-level');
        
        let name = nameSelect.value;
        let duration = 0;
        let levelText = "";

        if (name === "(직접입력)") {
            name = document.getElementById('custom-skill-name').value || "커스텀 스킬";
            const min = parseInt(document.getElementById('custom-min').value) || 0;
            const sec = parseInt(document.getElementById('custom-sec').value) || 0;
            duration = (min * 60) + sec;
            levelText = "Custom";
        } else {
            const lv = parseInt(levelSelect.value);
            const skillInfo = SKILL_DB[name];
            duration = skillInfo.data(lv).t;
            levelText = `Lv.${lv}`;
        }
        
        const warnTime = parseInt(document.querySelector('.buff-warn').value) || 30;

        const newBuff = {
            id: Date.now(),
            name,
            levelText,
            totalDuration: duration,
            remaining: duration,
            isRunning: false,
            warnTime
        };

        // 사냥 중이면 추가하자마자 즉시 시작
        if (mainInstance && mainInstance.isHunting) {
            newBuff.isRunning = true;
        }

        this.buffs.push(newBuff);
        
        const previewList = document.getElementById('pip-preview-list');
        if (previewList.innerText.includes("추가된 버프가 없습니다")) previewList.innerHTML = "";

        // 사냥 중이면 타이머 엔진 가동 확인
        if (newBuff.isRunning) {
            this.startInternalTimer(mainInstance);
        }

        this.renderBuffList(mainInstance);
    }

    /**
     * 타이머 틱(Tick) 로직
     * - 1초마다 호출되어 남은 시간 차감
     * - 사냥 중일 경우 시간 종료 시 자동 재시작(Auto Loop)
     */
    tick(mainInstance) {
        let needUpdate = false;
        
        this.buffs.forEach(buff => {
            if (buff.isRunning) {
                if (buff.remaining > 0) {
                    buff.remaining--;
                    needUpdate = true;
                    
                    if (buff.remaining === buff.warnTime) {
                        playAlertSound('buff');
                    }
                } else if (buff.remaining <= 0) {
                    // 시간이 다 되었을 때
                    if (mainInstance && mainInstance.isHunting) {
                        // 사냥 중이면 자동 리셋 및 재시작 (Loop)
                        buff.remaining = buff.totalDuration;
                        buff.isRunning = true;
                        playAlertSound('buff'); // 재시작 알림
                    } else {
                        // 사냥 중이 아니면 정지
                        buff.isRunning = false;
                        buff.remaining = 0;
                    }
                    needUpdate = true;
                }
            }
        });

        // 상태 변경이 있거나 PIP 창이 열려있으면 UI 갱신
        if (needUpdate || this.pipWindow) {
            this.renderBuffList(mainInstance);
        }

        // 모든 버프가 종료되었으면 타이머 자동 정지
        this.stopInternalTimer();
    }

    /**
     * [Sync] 모든 버프 시작
     * - 메인 컨트롤러의 '사냥 시작/재개' 시 호출됨
     */
    startAllBuffs(mainInstance) {
        if (this.buffs.length === 0) return;

        this.buffs.forEach(buff => {
            // 남은 시간 없어도(0이어도) 꽉 채워서 시작하도록 로직 강화
            if (buff.remaining <= 0) buff.remaining = buff.totalDuration;
            buff.isRunning = true;
        });
        
        this.startInternalTimer(mainInstance);
        this.renderBuffList(mainInstance);
    }

    /**
     * [Sync] 모든 버프 초기화(Reset)
     * - 메인 컨트롤러의 '사냥 일시정지' 시 호출됨 (정지 및 시간 리셋)
     */
    resetAllBuffs(mainInstance) {
        if (this.buffs.length === 0) return;

        this.buffs.forEach(buff => {
            buff.isRunning = false;
            buff.remaining = buff.totalDuration; // 전체 시간으로 초기화
        });

        this.stopInternalTimer();
        this.renderBuffList(mainInstance);
    }

    /**
     * 개별 버프 토글 (독립 제어)
     * - 시작 버튼 클릭 시 해당 버프만 실행
     */
    toggleBuff(id, mainInstance) {
        const buff = this.buffs.find(b => b.id === id);
        if (buff) {
            if (buff.remaining <= 0) buff.remaining = buff.totalDuration;
            buff.isRunning = !buff.isRunning;
            
            // 활성화 시 내부 타이머 가동
            if (buff.isRunning) this.startInternalTimer(mainInstance);
            
            this.renderBuffList(mainInstance);
        }
    }

    // 시간 스킵 (초 단위 가감)
    skipTime(id, seconds, mainInstance) {
        const buff = this.buffs.find(b => b.id === id);
        if (buff) {
            buff.remaining += seconds;
            if (buff.remaining < 0) buff.remaining = 0;
            this.renderBuffList(mainInstance);
        }
    }

    // 버프 삭제
    deleteBuff(id, mainInstance) {
        this.buffs = this.buffs.filter(b => b.id !== id);
        this.renderBuffList(mainInstance);
    }

    /**
     * 버프 리스트 렌더링 (CSS 클래스 사용)
     */
    renderBuffList(mainInstance) {
        const container = document.getElementById('pip-preview-list');
        if (!container) return;

        if (this.buffs.length === 0) {
            container.innerHTML = '<div style="text-align: center; color: #57606f; margin-top: 20px;">추가된 버프가 없습니다.</div>';
            this.updatePipWindow(mainInstance);
            return;
        }

        container.innerHTML = '';

        this.buffs.forEach(buff => {
            const el = document.createElement('div');
            el.className = 'registered-buff-item';
            
            // 상태에 따른 CSS 클래스 결정
            const timerStatusClass = buff.remaining <= buff.warnTime ? 'warn' : 'safe';
            const toggleBtnClass = buff.isRunning ? 'orange' : 'green';
            const btnIcon = buff.isRunning ? '⏸' : '▶';

            // HTML 구조 생성 (hukjukki.css 클래스 활용)
            el.innerHTML = `
                <div class="buff-info">
                    <div class="buff-name-text">${buff.name}</div>
                    <div class="buff-level-text">${buff.levelText}</div>
                </div>
                
                <div class="buff-timer-container">
                    <span class="timer-text ${timerStatusClass}">
                        ${formatTime(buff.remaining)}
                    </span>
                </div>

                <div class="buff-controls">
                    <button class="ctl-btn gray btn-minus" data-id="${buff.id}">-5</button>
                    <button class="ctl-btn ${toggleBtnClass} btn-toggle" data-id="${buff.id}">${btnIcon}</button>
                    <button class="ctl-btn gray btn-plus" data-id="${buff.id}">+5</button>
                    <button class="ctl-btn red btn-del" data-id="${buff.id}">×</button>
                </div>
            `;
            
            // 이벤트 바인딩
            el.querySelector('.btn-minus').onclick = () => this.skipTime(buff.id, -5, mainInstance);
            el.querySelector('.btn-plus').onclick = () => this.skipTime(buff.id, 5, mainInstance);
            el.querySelector('.btn-toggle').onclick = () => this.toggleBuff(buff.id, mainInstance);
            el.querySelector('.btn-del').onclick = () => this.deleteBuff(buff.id, mainInstance);

            container.appendChild(el);
        });

        this.updatePipWindow(mainInstance);
    }

    // PIP 모드 토글 (Picture-in-Picture)
    async togglePip(mainInstance) {
        if (this.pipWindow) { 
            this.pipWindow.close(); 
            this.pipWindow = null; 
            return; 
        }
        try {
            this.pipWindow = await window.documentPictureInPicture.requestWindow({ width: 300, height: 450 });
            this.updatePipWindow(mainInstance);
        } catch (e) { console.error("PIP 오류:", e); }
    }

    // PIP 창 업데이트 및 동기화 (버튼 텍스트 로직 개선)
    updatePipWindow(mainInstance) {
        if (!this.pipWindow || this.pipWindow.closed) return;
        
        const pipDoc = this.pipWindow.document;
        const mainList = document.getElementById('pip-preview-list');

        // PIP 레이아웃 초기화
        if (!pipDoc.getElementById('pip-layout')) {
            pipDoc.body.style.backgroundColor = "#1e2124";
            [...document.styleSheets].forEach(styleSheet => {
                try {
                    const cssRules = [...styleSheet.cssRules].map(rule => rule.cssText).join('');
                    const style = document.createElement('style');
                    style.textContent = cssRules;
                    pipDoc.head.appendChild(style);
                } catch (e) { }
            });

            pipDoc.body.innerHTML = `
                <div id="pip-layout" style="color:white; padding:10px;">
                    <div style="border:1px solid #78e08f; padding:10px; border-radius:8px; display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                        <span id="pip-timer-display" style="font-size:20px; font-weight:bold; color:#78e08f;">00:00</span>
                        <button id="pip-main-btn" style="background:#2ecc71; border:none; color:white; padding:5px 10px; border-radius:4px; cursor:pointer;">시작</button>
                    </div>
                    <div id="pip-buff-list"></div>
                </div>`;
            
            const mainBtn = pipDoc.getElementById('pip-main-btn');
            mainBtn.onclick = () => mainInstance.handleHuntControl();
        }

        // 사냥 상태 및 남은 시간 확인
        const isHunting = mainInstance ? mainInstance.isHunting : false;
        const timeLeft = mainInstance ? mainInstance.timeLeft : 0;
        
        // PIP 버튼 텍스트 로직 고도화 (초기값 '시작' 보장)
        const pipMainBtn = pipDoc.getElementById('pip-main-btn');
        if (pipMainBtn) {
            if (isHunting) {
                pipMainBtn.innerText = "일시정지";
                pipMainBtn.style.background = "#e67e22";
            } else {
                // 사냥 중 아님
                const durationInput = document.getElementById('hunt-duration-input');
                const totalDuration = (parseInt(durationInput?.value) || 60) * 60;
                
                // 시간이 전체 시간보다 작고(진행됨), 0보다는 크면 '재개'
                // 시간이 전체 시간과 같거나(초기), 0이면 '시작'
                // 단, 사냥을 시작도 안 한 상태(timeLeft == totalDuration)를 명확히 '시작'으로 처리
                if (timeLeft > 0 && timeLeft < totalDuration) {
                    pipMainBtn.innerText = "재개";
                    pipMainBtn.style.background = "#2ecc71";
                } else {
                    pipMainBtn.innerText = "시작";
                    pipMainBtn.style.background = "#2ecc71";
                }
            }
        }

        const pipTimer = pipDoc.getElementById('pip-timer-display');
        if (pipTimer) pipTimer.innerText = formatTime(timeLeft);

        // 버프 리스트 동기화
        const pipList = pipDoc.getElementById('pip-buff-list');
        if (pipList && mainList) {
            pipList.innerHTML = mainList.innerHTML;
            
            // PIP에서는 삭제 버튼 제거
            pipList.querySelectorAll('.btn-del').forEach(btn => btn.remove());
            
            // PIP 내부 버튼 이벤트 재연결
            this.buffs.forEach(buff => {
                const btnMinus = pipList.querySelector(`.btn-minus[data-id="${buff.id}"]`);
                const btnToggle = pipList.querySelector(`.btn-toggle[data-id="${buff.id}"]`);
                const btnPlus = pipList.querySelector(`.btn-plus[data-id="${buff.id}"]`);

                if(btnMinus) btnMinus.onclick = () => this.skipTime(buff.id, -5, mainInstance);
                if(btnToggle) btnToggle.onclick = () => this.toggleBuff(buff.id, mainInstance);
                if(btnPlus) btnPlus.onclick = () => this.skipTime(buff.id, 5, mainInstance);
            });
        }
    }
}