/**
 * @file utils.js
 * @description 공통으로 사용되는 유틸리티 함수 모음
 */

/**
 * 상황별 알람 소리 재생 (사운드 피드백)
 * @param {string} type - 'buff'(경고음) 또는 'finish'(종료음)
 */
export function playAlertSound(type) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    
    const ctx = new AudioContext();
    const beep = (freq, duration, wave) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = wave;
        osc.frequency.value = freq;
        gain.gain.value = 0.1;
        osc.start();
        osc.stop(ctx.currentTime + duration);
    };

    if (type === 'buff') {
        [0, 0.2, 0.4].forEach(d => setTimeout(() => beep(880, 0.1, 'sine'), d * 1000));
    } else if (type === 'finish') {
        [0, 0.3].forEach(d => setTimeout(() => beep(440, 0.2, 'square'), d * 1000));
    }
}

/**
 * 초(seconds)를 M:SS 형식의 문자열로 변환
 * @param {number} seconds 
 * @returns {string} 포맷팅된 시간 문자열
 */
export function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' + s : s}`;
}