/**
 * @file logic.js
 * @description 사냥 수익 계산 및 통계 데이터를 관리하는 핵심 로직 클래스
 */

export class HuntCalculator {
    constructor() {
        // 전체 누적 데이터 초기화
        this.totalExp = 0;
        this.expHistory = [];
        this.totalProfit = 0;
        this.profitHistory = [];
    }

    /**
     * 사냥 결과 정산 연산
     * @param {Object} data - 입력된 메소, 아이템가치, 포션비용 등
     * @returns {Object} 정산된 수익 및 순수 메소 결과
     */
    calculate(data) {
        const { mB, mA, iV, bM, hpCost, mpCost, currentExp } = data;

        // 순수 메소: 종료 메소 - 시작 메소
        const netMeso = mA - mB;
        
        // 최종 수익: 순수 메소 + 득템 - 포션 - 기타비용
        // bM은 main.js에서 '지출'이면 양수, '수익'이면 음수로 처리되어 들어옴
        // 따라서 여기서는 무조건 빼기 (비용 차감)
        const profit = netMeso + iV - (hpCost + mpCost) - bM;

        // 히스토리 업데이트
        if (currentExp > 0) {
            this.totalExp += currentExp;
            this.expHistory.push(currentExp);
        }
        this.totalProfit += profit;
        this.profitHistory.push(profit);

        return { profit, netMeso, totalCost: hpCost + mpCost };
    }
}