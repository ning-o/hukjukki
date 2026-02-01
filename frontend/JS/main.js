/**
 * @file main.js
 * @description 메인 컨트롤러 - 사냥 타이머 제어, UI 상태 동기화 및 매니저 모듈 관리
 */

import { formatTime, playAlertSound } from './utils.js';
import { BuffManager } from './buffManager.js';
import { ReportManager } from './reportManager.js';

class MainController {
    constructor() {
        this.buffManager = null;
        this.reportManager = null;
        
        this.huntInterval = null;
        this.timeLeft = 0;
        this.isHunting = false;

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    /**
     * 초기화(Init) 및 이벤트 리스너 바인딩
     */
    init() {
        this.buffManager = new BuffManager();
        this.reportManager = new ReportManager();
        this.bindEvents();
        
        // 초기 로드 시 Input 값을 읽어와서 타이머 설정 (Default 값 적용)
        const durationInput = document.getElementById('hunt-duration-input');
        if (durationInput) {
            const initialMin = parseInt(durationInput.value) || 60;
            this.timeLeft = initialMin * 60;
        }

        // 초기 버튼 텍스트 및 PIP 상태 업데이트
        this.updateButtonState();
    }

    /**
     * DOM 이벤트 바인딩
     */
    bindEvents() {
        const getEl = (id) => document.getElementById(id);
        
        const pipBtn = getEl('pipBtn');
        const mainBtn = getEl('mainBtn');
        const addBuffBtn = getEl('addBuffBtn');
        const abortBtn = getEl('abortBtn');
        const mainLogo = getEl('mainLogo');
        const calcBtn = document.querySelector('.btn-calc'); 
        const durationInput = getEl('hunt-duration-input');

        // 매니저 모듈 기능 연결 (Delegation)
        if (pipBtn) pipBtn.onclick = () => this.buffManager.togglePip(this);
        if (addBuffBtn) addBuffBtn.onclick = () => this.buffManager.addBuffGroup(this);
        if (calcBtn) calcBtn.onclick = () => this.reportManager.calculateResult();

        // 메인 컨트롤러 기능 연결
        if (mainBtn) mainBtn.onclick = () => this.handleHuntControl();
        if (abortBtn) abortBtn.onclick = () => this.stopAndFinish();
        if (mainLogo) mainLogo.onclick = () => location.reload();

        // [설정] 사냥 시간 변경 감지 (Input Change Event)
        if (durationInput) {
            durationInput.addEventListener('input', () => {
                // 사냥 중이 아닐 때만 시간 변경 허용 (Validation)
                if (!this.isHunting) {
                    const minutes = parseInt(durationInput.value);
                    if (minutes > 0) {
                        this.timeLeft = minutes * 60;
                        
                        // 변경된 시간을 버튼 텍스트와 PIP 창에 즉시 반영 (Sync)
                        this.updateButtonState();
                        if (this.buffManager) this.buffManager.updatePipWindow(this);
                    }
                }
            });
        }
    }

    /**
     * 사냥 제어 핸들러 (Start / Pause / Resume)
     * - 타이머 Interval 관리 및 상태에 따른 로직 분기
     * - BuffManager와의 동기화 수행
     */
    /**
     * 사냥 제어 핸들러 (Start / Pause / Resume)
     */
    handleHuntControl() {
        const timerDisplay = document.getElementById('timerDisplay');
        const durationInput = document.getElementById('hunt-duration-input');

        // Case 1: 사냥 중 -> 일시정지 (Pause)
        if (this.huntInterval) {
            clearInterval(this.huntInterval);
            this.huntInterval = null;
            this.isHunting = false;
            
            this.updateButtonState();
            
            // [Sync] 버프 타이머: 초기화(Reset) 및 대기
            if (this.buffManager) {
                this.buffManager.resetAllBuffs(this);
                this.buffManager.updatePipWindow(this);
            }
            return;
        }

        // Case 2: 대기/일시정지 -> 사냥 시작 (Start/Resume)
        this.isHunting = true;
        
        // 시간이 유효하지 않으면(0 이하) 설정값 리로드
        if (this.timeLeft <= 0) {
            this.timeLeft = (parseInt(durationInput?.value) || 60) * 60;
        }

        // [Sync] 버프 타이머: 사냥 시작과 동시에 가동
        if (this.buffManager) {
            this.buffManager.startAllBuffs(this);
        }

        document.getElementById('hunt-setting-panel')?.classList.add('hidden');
        timerDisplay.classList.remove('hidden');

        this.updateButtonState();

        // 사냥 타이머 Interval 시작
        this.huntInterval = setInterval(() => {
            this.timeLeft--;
            const timeStr = formatTime(this.timeLeft);
            timerDisplay.innerText = `사냥 중... ${timeStr}`;
            
            // 사냥 타이머 진행 중 PIP 창 실시간 갱신
            if (this.buffManager) this.buffManager.updatePipWindow(this);

            // 시간 종료 체크
            if (this.timeLeft <= 0) this.stopAndFinish();
        }, 1000);
        
        // 즉시 상태 반영
        if (this.buffManager) this.buffManager.updatePipWindow(this);
    }

    /**
     * 버튼의 텍스트와 색상을 상태에 따라 변경하는 함수
     */
    updateButtonState() {
        const mainBtn = document.getElementById('mainBtn');
        const durationInput = document.getElementById('hunt-duration-input');
        
        if (!mainBtn) return;

        mainBtn.style.background = ""; 

        // 전체 설정 시간 계산 (분 -> 초)
        const totalDuration = (parseInt(durationInput?.value) || 60) * 60;

        if (this.isHunting) {
            // [일시정지 상태] -> 주황색
            mainBtn.innerText = "사냥 일시정지";
            mainBtn.style.background = "#e67e22"; 
        } else {
            // [재개 상태] -> 시간이 조금이라도 흘렀고(줄어들었고), 0보다는 클 때 -> 초록 단색
            if (this.timeLeft > 0 && this.timeLeft < totalDuration) {
                mainBtn.innerText = "사냥 재개";
                mainBtn.style.background = "#2ecc71"; 
            } else {
                // [시작 상태] -> 시간이 꽉 차있거나, 0일 때
                mainBtn.innerText = "사냥 시작";
            }
        }
    }

    /**
     * 사냥 종료 및 데이터 집계 준비 (Finish)
     */
    stopAndFinish() {
        if (this.huntInterval) clearInterval(this.huntInterval);
        this.huntInterval = null;
        this.isHunting = false;
        
        // 종료 시 시간을 0으로 초기화
        this.timeLeft = 0; 
        
        playAlertSound('finish');
        
        // [Sync] 종료 시 버프 리셋
        if (this.buffManager) {
            this.buffManager.resetAllBuffs(this);
        }

        this.updateButtonState();
        
        // 버튼 비활성화 및 결과 입력 모드 전환
        const mainBtn = document.getElementById('mainBtn');
        if (mainBtn) {
            mainBtn.innerText = "데이터 수집 완료";
            mainBtn.disabled = true;
            mainBtn.style.background = "#2f3542";
        }

        const timerDisplay = document.getElementById('timerDisplay');
        if (timerDisplay) {
            timerDisplay.classList.add('hidden');
            timerDisplay.innerText = "";
        }

        document.getElementById('section-after')?.classList.remove('hidden');
        if (this.buffManager) this.buffManager.updatePipWindow(this);
        document.getElementById('section-after')?.scrollIntoView({ behavior: 'smooth' });
    }

    /**
     * 버튼 UI 상태 업데이트
     * - 현재 상태(isHunting)와 남은 시간(timeLeft)에 따라 텍스트/스타일 변경
     */
    updateButtonState() {
        const mainBtn = document.getElementById('mainBtn');
        const durationInput = document.getElementById('hunt-duration-input');
        
        if (!mainBtn) return;

        mainBtn.style.background = ""; 

        // 전체 설정 시간 계산 (분 -> 초)
        const totalDuration = (parseInt(durationInput?.value) || 60) * 60;

        if (this.isHunting) {
            // 1. 사냥 중일 때 -> [일시정지] (주황색)
            mainBtn.innerText = "사냥 일시정지";
            mainBtn.style.background = "#e67e22"; 
        } else {
            // 2. 사냥 중이 아닐 때
            
            // 시간이 조금이라도 줄어들었고(진행됨), 0보다는 클 때 -> [재개]
            if (this.timeLeft > 0 && this.timeLeft < totalDuration) {
                mainBtn.innerText = "사냥 재개";
                mainBtn.style.background = "#2ecc71"; 
            } else {
                // 시간이 꽉 차있거나(초기상태), 0일 때 -> [시작]
                mainBtn.innerText = "사냥 시작";
            }
        }
    }
}

new MainController();