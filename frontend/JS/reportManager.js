/**
 * @file reportManager.js
 * @description 포션 관리, 사냥 결과 계산 및 리포트 출력
 */
import { POTIONS } from './constants.js';
import { HuntCalculator } from './logic.js';

export class ReportManager {
    constructor() {
        this.calculator = new HuntCalculator();
        this.initPotionSelects();
    }

    // 소수점 처리
    formatUnit(value) {
        const unitVal = value / 10000;
        if (Number.isInteger(unitVal)) {
            return unitVal.toString(); 
        } else {
            return unitVal.toFixed(1);
        }
    }

    initPotionSelects() {
        const hpS = document.getElementById('hpPotion');
        const mpS = document.getElementById('mpPotion');
        if (!hpS || !mpS) return;

        hpS.innerHTML = '';
        mpS.innerHTML = '';

        const commonOptions = [
            { text: '없음', value: 'none' },
            { text: '직접입력', value: 'custom' }
        ];

        [hpS, mpS].forEach(select => {
            commonOptions.forEach(opt => select.add(new Option(opt.text, opt.value)));
        });

        Object.entries(POTIONS.HP).forEach(([name, price]) => hpS.add(new Option(`${name} (${price}원)`, name)));
        Object.entries(POTIONS.MP).forEach(([name, price]) => mpS.add(new Option(`${name} (${price}원)`, name)));

        hpS.value = "쭈쭈바";
        mpS.value = "마엘";

        hpS.onchange = (e) => this.handlePotionChange(e.target, 'HP');
        mpS.onchange = (e) => this.handlePotionChange(e.target, 'MP');
    }

    handlePotionChange(selectElem, type) {
        const val = selectElem.value;
        const container = selectElem.parentNode; 
        
        // 기존에 만들어진 입력창이 있다면 무조건 삭제부터 함 (ID 충돌 방지)
        const existingGroup = document.getElementById(`custom-group-${type}`);
        if (existingGroup) {
            existingGroup.remove();
        }

        if (val === 'custom') {
            selectElem.style.display = 'none';
            const group = document.createElement('div');
            group.id = `custom-group-${type}`; // ID 중복 방지를 위해 위에서 삭제함
            group.className = 'custom-input-group';
            
            // 취소 버튼 ID 부여 (이벤트 연결용)
            group.innerHTML = `
                <input type="text" id="custom-name-${type}" placeholder="포션 이름" class="report-input">
                <input type="text" id="custom-price-${type}" placeholder="가격(원)" class="report-input">
                <button type="button" id="btn-cancel-${type}" class="btn-reset">↺ 취소</button>
            `;
            container.insertBefore(group, selectElem.nextSibling);

            // 생성된 취소 버튼에 기능 연결
            const cancelBtn = document.getElementById(`btn-cancel-${type}`);
            if (cancelBtn) {
                cancelBtn.onclick = () => {
                    group.remove(); // 입력창 삭제
                    selectElem.style.display = ''; // 원래 선택창 보이기
                    selectElem.value = 'none'; // 값 초기화
                };
            }
        }
    }

    getSelectedPotionPrice(type) {
        const select = document.getElementById(`${type.toLowerCase()}Potion`);
        if (!select) return 0; // 방어 코드

        const val = select.value;
        if (val === 'none') return 0;
        
        if (val === 'custom') {
            const inputEl = document.getElementById(`custom-price-${type}`);
            if (!inputEl) return 0;
            
            // 쉼표(,)를 제거하고 숫자로 변환. 1200이든 1,200이든 모두 처리 가능
            const rawValue = inputEl.value;
            const cleanValue = rawValue.toString().replace(/,/g, '');
            return Number(cleanValue) || 0;
        }
        
        return POTIONS[type][val] || 0;
    }

    calculateResult() {
        const getVal = (id) => {
            const el = document.getElementById(id);
            if (!el) return 0;
            return Number(el.value.toString().replace(/,/g, '')) || 0;
        };

        const moneyType = document.getElementById('moneyType').value;
        let bringMoneyVal = getVal('bringMoney') * 10000;

        if (moneyType === 'plus') {
            bringMoneyVal = -bringMoneyVal;
        } else if (moneyType === 'none') {
            bringMoneyVal = 0;
        }

        const data = {
            mB: getVal('mesoBefore') * 10000,
            mA: getVal('mesoAfter') * 10000,
            iV: getVal('itemsValue') * 10000,
            bM: bringMoneyVal,
            hpBefore: getVal('hpBefore'), 
            hpAfter: getVal('hpAfter'),
            mpBefore: getVal('mpBefore'), 
            mpAfter: getVal('mpAfter'),
            currentExp: getVal('expGain') * 10000
        };

        const hpUsed = data.hpBefore - data.hpAfter;
        const mpUsed = data.mpBefore - data.mpAfter;
        const hpPrice = this.getSelectedPotionPrice('HP');
        const mpPrice = this.getSelectedPotionPrice('MP');
        
        const result = this.calculator.calculate({
            ...data,
            hpCost: hpUsed * hpPrice,
            mpCost: mpUsed * mpPrice
        });

        this.renderReport(result, data);
    }

    renderReport(result, data) {
        const resDiv = document.getElementById('result');
        if (!resDiv) return;

        resDiv.classList.remove('hidden');

        const isProfit = result.profit >= 0;
        const statusText = isProfit ? "흑자" : "적자";
        const statusClass = isProfit ? "text-success" : "text-danger";

        // 지참/지원금 텍스트 처리
        let otherText = "";
        let otherClass = "";
        
        if (data.bM > 0) {
            otherText = `-${this.formatUnit(data.bM)}만`;
            otherClass = "text-danger";
        } else if (data.bM < 0) {
            otherText = `+${this.formatUnit(Math.abs(data.bM))}만`;
            otherClass = "text-success";
        } else {
            otherText = "0만";
            otherClass = "text-bold";
        }

        // 포션 비용 텍스트 처리 (0원일 때 - 기호 제거)
        // 비용이 0보다 클 때만 앞에 '-'를 붙이고, 0이면 그냥 숫자만 표시
        const costVal = result.totalCost;
        const costText = costVal > 0 ? `-${this.formatUnit(costVal)}` : "0";

        // 히스토리 리스트 생성
        let historyListHTML = '<div class="history-list">';
        this.calculator.profitHistory.forEach((profit, idx) => {
            const exp = this.calculator.expHistory[idx] || 0;
            const roundProfitClass = profit >= 0 ? "text-success" : "text-danger";
            const roundProfitSign = profit >= 0 ? "+" : "";
            
            historyListHTML += `
                <div class="history-item">
                    <span class="history-round">${idx + 1}탐</span>
                    <span class="history-data">
                        <span style="color:#dfe6e9;">Exp ${this.formatUnit(exp)}만</span> | 
                        <span class="${roundProfitClass}">Meso ${roundProfitSign}${this.formatUnit(profit)}만</span>
                    </span>
                </div>
            `;
        });
        historyListHTML += '</div>';

        // HTML 렌더링
        resDiv.innerHTML = `
            <div class="report-container">
                <h3 class="report-title">📊 사냥 결과 리포트</h3>
                
                <p class="report-result-text ${statusClass}">
                    이번 타임: ${this.formatUnit(result.profit)}만 메소 [${statusText}]
                </p>
                
                <div class="report-summary-box">
                    <div class="summary-item">
                        <span>순수 메소</span><br>
                        <strong class="text-success">${this.formatUnit(result.netMeso)}만</strong>
                    </div>
                    <div class="summary-item">
                        <span>득템 가치</span><br>
                        <strong class="text-bold">${this.formatUnit(data.iV)}만</strong>
                    </div>
                    <div class="summary-item">
                        <span>포션 비용</span><br>
                        <strong class="text-danger">${costText}만</strong>
                    </div>
                     <div class="summary-item">
                        <span>지참or지원금</span><br>
                        <strong class="${otherClass}">${otherText}</strong>
                    </div>
                </div>

                <div class="history-box">
                    <h4 class="history-title">📈 누적 사냥 기록 (Total)</h4>
                    <div class="history-row">
                        <span>총 누적 수익:</span>
                        <span class="text-bold">${this.formatUnit(this.calculator.totalProfit)}만 메소</span>
                    </div>
                    <div class="history-row">
                        <span>총 획득 경험치:</span>
                        <span class="text-success text-bold">${this.calculator.totalExp.toLocaleString()} EXP</span>
                    </div>
                    ${historyListHTML}
                </div>

                <button id="retryBtn" class="btn-retry">
                    다시 사냥하기 (데이터 이월)
                </button>
            </div>
        `;

        // 다시 사냥하기 버튼 이벤트
        const retryBtn = document.getElementById('retryBtn');
        if (retryBtn) {
            retryBtn.onclick = () => {
                const transfer = (srcId, destId) => {
                    const src = document.getElementById(srcId);
                    const dest = document.getElementById(destId);
                    if (src && dest && src.value) dest.value = src.value;
                };
                
                transfer('mesoAfter', 'mesoBefore');
                transfer('hpAfter', 'hpBefore');
                transfer('mpAfter', 'mpBefore');

                ['mesoAfter', 'hpAfter', 'mpAfter', 'itemsValue', 'bringMoney', 'expGain'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.value = '';
                });

                resDiv.classList.add('hidden');
                document.getElementById('section-after')?.classList.add('hidden');
                document.getElementById('hunt-setting-panel')?.classList.add('hidden'); 
                document.getElementById('timerDisplay')?.classList.add('hidden');

                const mainBtn = document.getElementById('mainBtn');
                if (mainBtn) {
                    mainBtn.disabled = false;
                    mainBtn.innerText = "사냥 시작";
                    mainBtn.style.background = ""; 
                }

                window.scrollTo({ top: 0, behavior: 'smooth' });
            };
        }
        resDiv.scrollIntoView({ behavior: 'smooth' });
    }
}