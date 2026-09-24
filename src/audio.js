/**
 * SakamichiTD - Web Audio API Procedural Sound Engine
 * 外部音源ファイル不要で、シンセサイズにより重低音・ゴツン激突音・爆発音・ファンファーレ等を完全生成
 */
class SoundEngine {
    constructor() {
        this.ctx = null;
        this.enabled = true;
        this.volume = 0.5;
    }

    init() {
        if (!this.ctx) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (AudioContextClass) {
                this.ctx = new AudioContextClass();
            }
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    // 基本のゴツン！激突音（初撃の重い手応え）
    playGotsun(intensity = 1.0) {
        if (!this.enabled || !this.ctx) return;
        try {
            const t = this.ctx.currentTime;
            
            // 1. 低音インパクト (サブベースのキック)
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            
            const startFreq = 180 * intensity;
            const endFreq = 35;
            osc.frequency.setValueAtTime(startFreq, t);
            osc.frequency.exponentialRampToValueAtTime(endFreq, t + 0.12);
            
            gain.gain.setValueAtTime(0.8 * this.volume * Math.min(intensity, 1.8), t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
            
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            
            osc.start(t);
            osc.stop(t + 0.18);

            // 2. 「カチッ」「ゴツン」のクリックアタック (高域のノック音)
            const clickOsc = this.ctx.createOscillator();
            const clickGain = this.ctx.createGain();
            clickOsc.type = 'triangle';
            clickOsc.frequency.setValueAtTime(600 * intensity, t);
            clickOsc.frequency.exponentialRampToValueAtTime(80, t + 0.04);

            clickGain.gain.setValueAtTime(0.6 * this.volume, t);
            clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.045);

            clickOsc.connect(clickGain);
            clickGain.connect(this.ctx.destination);

            clickOsc.start(t);
            clickOsc.stop(t + 0.045);
        } catch (e) {
            console.warn('Audio error:', e);
        }
    }

    // 鉄球のズッシリとした金属・重低音衝突音
    playIronImpact() {
        if (!this.enabled || !this.ctx) return;
        try {
            const t = this.ctx.currentTime;
            
            // 超低音
            const osc1 = this.ctx.createOscillator();
            const gain1 = this.ctx.createGain();
            osc1.type = 'triangle';
            osc1.frequency.setValueAtTime(100, t);
            osc1.frequency.exponentialRampToValueAtTime(25, t + 0.28);
            gain1.gain.setValueAtTime(1.0 * this.volume, t);
            gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
            osc1.connect(gain1);
            gain1.connect(this.ctx.destination);
            osc1.start(t);
            osc1.stop(t + 0.3);

            // 金属クラング音
            const osc2 = this.ctx.createOscillator();
            const gain2 = this.ctx.createGain();
            osc2.type = 'sawtooth';
            osc2.frequency.setValueAtTime(420, t);
            osc2.frequency.exponentialRampToValueAtTime(120, t + 0.15);
            gain2.gain.setValueAtTime(0.35 * this.volume, t);
            gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
            osc2.connect(gain2);
            gain2.connect(this.ctx.destination);
            osc2.start(t);
            osc2.stop(t + 0.15);
        } catch (e) {}
    }

    // ピンポン玉の軽快なポコン音
    playPingPong() {
        if (!this.enabled || !this.ctx) return;
        try {
            const t = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(800 + Math.random() * 80, t);
            osc.frequency.exponentialRampToValueAtTime(320, t + 0.06);

            gain.gain.setValueAtTime(0.4 * this.volume, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.065);

            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(t);
            osc.stop(t + 0.065);
        } catch (e) {}
    }

    // トゲ玉のジャキッという連続ダメージ音
    playSpikeHit() {
        if (!this.enabled || !this.ctx) return;
        try {
            const t = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(500 + Math.random() * 200, t);
            osc.frequency.linearRampToValueAtTime(150, t + 0.05);

            gain.gain.setValueAtTime(0.25 * this.volume, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.055);

            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(t);
            osc.stop(t + 0.055);
        } catch (e) {}
    }

    // スーパーボールのピョンピョン跳ねる音
    playBounce() {
        if (!this.enabled || !this.ctx) return;
        try {
            const t = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(250, t);
            osc.frequency.exponentialRampToValueAtTime(750, t + 0.09);

            gain.gain.setValueAtTime(0.45 * this.volume, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(t);
            osc.stop(t + 0.1);
        } catch (e) {}
    }

    // ボムボールの爆発音（大迫力ノイズ＋サブベース）
    playExplosion() {
        if (!this.enabled || !this.ctx) return;
        try {
            const t = this.ctx.currentTime;
            const bufferSize = this.ctx.sampleRate * 0.4;
            const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }

            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;

            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(900, t);
            filter.frequency.exponentialRampToValueAtTime(60, t + 0.4);

            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(1.0 * this.volume, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

            noise.connect(filter);
            filter.connect(gain);
            gain.connect(this.ctx.destination);

            noise.start(t);
            noise.stop(t + 0.4);

            // 爆発の芯となる重低音
            const osc = this.ctx.createOscillator();
            const oscGain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(140, t);
            osc.frequency.exponentialRampToValueAtTime(30, t + 0.35);
            oscGain.gain.setValueAtTime(0.9 * this.volume, t);
            oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

            osc.connect(oscGain);
            oscGain.connect(this.ctx.destination);
            osc.start(t);
            osc.stop(t + 0.35);
        } catch (e) {}
    }

    // 必殺技: ギガロック（大落石の地響き）
    playBoulder() {
        if (!this.enabled || !this.ctx) return;
        try {
            const t = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(60, t);
            osc.frequency.linearRampToValueAtTime(40, t + 1.2);

            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(180, t);

            gain.gain.setValueAtTime(0.7 * this.volume, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 1.2);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(t);
            osc.stop(t + 1.2);
        } catch (e) {}
    }

    // 必殺技: ブースタースロープ起動音
    playBooster() {
        if (!this.enabled || !this.ctx) return;
        try {
            const t = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(260, t);
            osc.frequency.exponentialRampToValueAtTime(1400, t + 0.4);

            gain.gain.setValueAtTime(0.5 * this.volume, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);

            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(t);
            osc.stop(t + 0.45);
        } catch (e) {}
    }

    // 必殺技: ピンボールフィーバーのバンパーヒット音
    playPinball(pitch = 1.0) {
        if (!this.enabled || !this.ctx) return;
        try {
            const t = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(900 * pitch, t);
            osc.frequency.exponentialRampToValueAtTime(1400 * pitch, t + 0.08);

            gain.gain.setValueAtTime(0.4 * this.volume, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);

            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(t);
            osc.stop(t + 0.09);
        } catch (e) {}
    }

    // 通常ポコポコ攻撃音
    playPoko() {
        if (!this.enabled || !this.ctx) return;
        try {
            const t = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(300 + Math.random() * 80, t);
            osc.frequency.exponentialRampToValueAtTime(90, t + 0.05);

            gain.gain.setValueAtTime(0.3 * this.volume, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.055);

            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(t);
            osc.stop(t + 0.055);
        } catch (e) {}
    }

    // ボール出撃音
    playSpawn() {
        if (!this.enabled || !this.ctx) return;
        try {
            const t = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(200, t);
            osc.frequency.exponentialRampToValueAtTime(480, t + 0.07);

            gain.gain.setValueAtTime(0.25 * this.volume, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(t);
            osc.stop(t + 0.08);
        } catch (e) {}
    }

    // カード選択・レリック獲得キラキラ音
    playUpgrade() {
        if (!this.enabled || !this.ctx) return;
        try {
            const notes = [523.25, 659.25, 783.99, 1046.50]; // C, E, G, High C
            notes.forEach((freq, idx) => {
                const t = this.ctx.currentTime + idx * 0.06;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, t);
                gain.gain.setValueAtTime(0.35 * this.volume, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(t);
                osc.stop(t + 0.15);
            });
        } catch (e) {}
    }

    // 同種ボール・敵のマージ合体音（スイカゲーム風の気持ちいいチャイム＋ポヨン音）
    playMergeSound(level = 2) {
        if (!this.enabled || !this.ctx) return;
        try {
            const t = this.ctx.currentTime;
            const baseFreq = level === 2 ? 587.33 : 880.00; // D5 または A5
            const notes = [baseFreq, baseFreq * 1.25, baseFreq * 1.5]; // 明るい和音

            notes.forEach((freq, idx) => {
                const noteT = t + idx * 0.045;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq * 0.8, noteT);
                osc.frequency.exponentialRampToValueAtTime(freq, noteT + 0.04);
                osc.frequency.exponentialRampToValueAtTime(freq * 1.5, noteT + 0.14);

                gain.gain.setValueAtTime(0.4 * this.volume, noteT);
                gain.gain.exponentialRampToValueAtTime(0.001, noteT + 0.16);

                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(noteT);
                osc.stop(noteT + 0.16);
            });

            // ポヨンッとした低音レゾナンス
            const bassOsc = this.ctx.createOscillator();
            const bassGain = this.ctx.createGain();
            bassOsc.type = 'triangle';
            bassOsc.frequency.setValueAtTime(160, t);
            bassOsc.frequency.exponentialRampToValueAtTime(320, t + 0.1);
            bassGain.gain.setValueAtTime(0.3 * this.volume, t);
            bassGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
            bassOsc.connect(bassGain);
            bassGain.connect(this.ctx.destination);
            bassOsc.start(t);
            bassOsc.stop(t + 0.12);
        } catch (e) {}
    }

    // 勝利ファンファーレ
    playVictory() {
        if (!this.enabled || !this.ctx) return;
        try {
            const notes = [440, 554.37, 659.25, 880];
            notes.forEach((freq, idx) => {
                const t = this.ctx.currentTime + idx * 0.12;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freq, t);
                gain.gain.setValueAtTime(0.4 * this.volume, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(t);
                osc.stop(t + 0.35);
            });
        } catch (e) {}
    }

    // 警告アラートサイレン（巨大ボス登場時）
    playWarningSiren() {
        if (!this.enabled || !this.ctx) return;
        try {
            const t = this.ctx.currentTime;
            for (let i = 0; i < 2; i++) {
                const startT = t + i * 0.35;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(450, startT);
                osc.frequency.linearRampToValueAtTime(850, startT + 0.18);
                osc.frequency.linearRampToValueAtTime(450, startT + 0.32);

                gain.gain.setValueAtTime(0.45 * this.volume, startT);
                gain.gain.exponentialRampToValueAtTime(0.001, startT + 0.34);

                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(startT);
                osc.stop(startT + 0.34);
            }
        } catch (e) {}
    }

    // 突風吹き飛ばし音（サイクロン攻撃）
    playCycloneWind() {
        if (!this.enabled || !this.ctx) return;
        try {
            const t = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(120, t);
            osc.frequency.exponentialRampToValueAtTime(450, t + 0.1);
            osc.frequency.exponentialRampToValueAtTime(80, t + 0.3);

            gain.gain.setValueAtTime(0.6 * this.volume, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.32);

            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(t);
            osc.stop(t + 0.32);
        } catch (e) {}
    }
}

window.soundEngine = new SoundEngine();
