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
     */
    initBuffSelect() {
        const skillSelect = document.querySelector('.buff-name');
        const levelSelect = document.querySelector('.buff-level');
        const defaultUI = document.getElementById('default-skill-ui');
        const customUI = document.getElementById('custom-skill-ui');
        const cancelBtn = document.getElementById('cancel-custom-btn'); 
        
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

        if (cancelBtn) {
            cancelBtn.onclick = () => {
                skillSelect.selectedIndex = 0;
                skillSelect.dispatchEvent(new Event('change'));
            };
        }

        skillSelect.dispatchEvent(new Event('change'));
    }

    /**
     * 내부 타이머 루프 시작
     */
    startInternalTimer(mainInstance) {
        if (this.intervalId) return; 

        this.intervalId = setInterval(() => {
            this.tick(mainInstance);
        }, 1000);
    }

    /**
     * 내부 타이머 루프 정지
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
        
        const warnTime = parseInt(document.querySelector('.buff-warn').value) || 0;

        const newBuff = {
            id: Date.now(),
            name,
            levelText,
            totalDuration: duration,
            remaining: duration,
            isRunning: false,
            warnTime
        };

        if (mainInstance && mainInstance.isHunting) {
            newBuff.isRunning = true;
        }

        this.buffs.push(newBuff);
        
        const previewList = document.getElementById('pip-preview-list');
        if (previewList.innerText.includes("추가된 버프가 없습니다")) previewList.innerHTML = "";

        if (newBuff.isRunning) {
            this.startInternalTimer(mainInstance);
        }

        this.renderBuffList(mainInstance);
    }

    /**
     * 타이머 틱(Tick) 로직 (알람 중복 방지 수정됨)
     */
    tick(mainInstance) {
        let needUpdate = false;
        
        this.buffs.forEach(buff => {
            if (buff.isRunning) {
                // 1. 시간이 남아있을 때 (Time Remaining)
                if (buff.remaining > 0) {
                    buff.remaining--;
                    needUpdate = true;
                    
                    // [Fix] 미리 알림 시간이 설정된 경우(>0), 정확히 그 시간에만 격발
                    if (buff.warnTime > 0 && buff.remaining === buff.warnTime) {
                        playAlertSound('buff');
                    }
                } 
                // 2. 시간이 다 되었을 때 (Time's Up)
                else if (buff.remaining <= 0) {
                    if (mainInstance && mainInstance.isHunting) {
                        // 사냥 중이면 자동 리셋 (Auto Loop)
                        buff.remaining = buff.totalDuration;
                        buff.isRunning = true;
                        
                        // [Fix] 미리 알림이 '0'이거나 없을 때만 종료 시(0초) 알람 울림
                        // (미리 알림이 설정되어 있다면, 여기서는 울리지 않음)
                        if (!buff.warnTime || buff.warnTime <= 0) {
                            playAlertSound('buff'); 
                        }
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

        // 모든 버프가 멈췄으면 내부 타이머도 정지
        this.stopInternalTimer();
    }

    /**
     * 모든 버프 시작
     */
    startAllBuffs(mainInstance) {
        if (this.buffs.length === 0) return;

        this.buffs.forEach(buff => {
            if (buff.remaining <= 0) buff.remaining = buff.totalDuration;
            buff.isRunning = true;
        });
        
        this.startInternalTimer(mainInstance);
        this.renderBuffList(mainInstance);
    }

    /**
     * 모든 버프 초기화
     */
    resetAllBuffs(mainInstance) {
        if (this.buffs.length === 0) return;

        this.buffs.forEach(buff => {
            buff.isRunning = false;
            buff.remaining = buff.totalDuration;
        });

        this.stopInternalTimer();
        this.renderBuffList(mainInstance);
    }

    /**
     * 개별 버프 토글
     */
    toggleBuff(id, mainInstance) {
        const buff = this.buffs.find(b => b.id === id);
        if (buff) {
            if (buff.remaining <= 0) buff.remaining = buff.totalDuration;
            buff.isRunning = !buff.isRunning;
            
            if (buff.isRunning) this.startInternalTimer(mainInstance);
            
            this.renderBuffList(mainInstance);
        }
    }

    // 시간 스킵
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
     * 버프 리스트 렌더링
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
            
            const timerStatusClass = buff.remaining <= buff.warnTime ? 'warn' : 'safe';
            const toggleBtnClass = buff.isRunning ? 'orange' : 'green';
            const btnIcon = buff.isRunning ? '⏸' : '▶';

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
            
            el.querySelector('.btn-minus').onclick = () => this.skipTime(buff.id, -5, mainInstance);
            el.querySelector('.btn-plus').onclick = () => this.skipTime(buff.id, 5, mainInstance);
            el.querySelector('.btn-toggle').onclick = () => this.toggleBuff(buff.id, mainInstance);
            el.querySelector('.btn-del').onclick = () => this.deleteBuff(buff.id, mainInstance);

            container.appendChild(el);
        });

        this.updatePipWindow(mainInstance);
    }

    // PIP 모드 토글
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

    // PIP 창 업데이트 및 동기화
    updatePipWindow(mainInstance) {
        if (!this.pipWindow || this.pipWindow.closed) return;
        
        const pipDoc = this.pipWindow.document;
        const mainList = document.getElementById('pip-preview-list');

        // PIP 레이아웃 구조가 없으면 새로 생성
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

            // 타이머 섹션 스타일 한 줄 배치
            // display: flex; justify-content: space-between;
            pipDoc.body.innerHTML = `
                <div id="pip-layout" style="color:white; padding:10px;">
                    <div id="pip-timer-section" style="
                        border:1px solid #78e08f; padding:10px; border-radius:8px; 
                        display:flex; justify-content:space-between; align-items:center; 
                        background: #2f3640; margin-bottom: 10px;">
                        
                        <span id="pip-timer-display" style="font-size:20px; font-weight:bold; color:#78e08f;">00:00</span>
                        <button id="pip-main-btn" style="background:#2ecc71; border:none; color:white; padding:5px 15px; border-radius:4px; cursor:pointer; font-weight:bold;">시작</button>
                    </div>

                    <div id="pip-buff-list"></div>
                </div>`;
            
            const mainBtn = pipDoc.getElementById('pip-main-btn');
            mainBtn.onclick = () => mainInstance.handleHuntControl();
        }

        // --- 데이터 동기화 로직 ---
        const isHunting = mainInstance ? mainInstance.isHunting : false;
        const timeLeft = mainInstance ? mainInstance.timeLeft : 0;
        
        const pipMainBtn = pipDoc.getElementById('pip-main-btn');
        if (pipMainBtn) {
            if (isHunting) {
                pipMainBtn.innerText = "일시정지";
                pipMainBtn.style.background = "#e67e22";
            } else {
                const durationInput = document.getElementById('hunt-duration-input');
                const totalDuration = (parseInt(durationInput?.value) || 60) * 60;
                
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

        const pipList = pipDoc.getElementById('pip-buff-list');
        
        if (pipList && mainList) {
            pipList.innerHTML = mainList.innerHTML;
            
            // PIP에서 삭제 버튼 제거
            pipList.querySelectorAll('.btn-del').forEach(btn => btn.remove());
            
            // 이벤트 재연결
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