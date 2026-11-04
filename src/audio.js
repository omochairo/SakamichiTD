/**
 * SakamichiTD - Web Audio API Procedural Sound Engine
 * 外部音源ファイル不要で、シンセサイズにより重低音・ゴツン激突音・爆発音・ファンファーレ等を完全生成
 */
class SoundEngine {
    constructor() {
        this.ctx = null;
        this.enabled = true;
        this.volume = 0.5;

        // 同時発音の上限（大乱闘時に発音ノードが際限なく積み上がり音割れ・負荷増になるのを防ぐ）
        this.maxVoices = 32;
        this.activeVoices = 0;
        // 同じ効果音を同一瞬間に重ね鳴らししない最小間隔（秒）
        this.minRetriggerInterval = 0.025;
        this.lastPlayed = {};
    }

    init() {
        if (!this.ctx) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (AudioContextClass) {
                try {
                    this.ctx = new AudioContextClass();
                } catch (e) {
                    console.warn('AudioContext init failed:', e);
                    this.ctx = null;
                }
            }
        }
        this.resumeIfNeeded();
    }

    // 音量 (0〜1)。以後に鳴らす効果音から反映される
    setVolume(volume) {
        const v = Number(volume);
        this.volume = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : this.volume;
    }

    setEnabled(enabled) {
        this.enabled = !!enabled;
    }

    // suspended / interrupted（iOS Safari の割り込み・タブ復帰時）なら再開を試みる
    resumeIfNeeded() {
        if (!this.ctx || this.ctx.state === 'running' || this.ctx.state === 'closed') return;
        try {
            const p = this.ctx.resume();
            if (p && typeof p.catch === 'function') p.catch(() => {});
        } catch (e) {}
    }

    // 発音可否の判定（無効化・未初期化・同時発音上限・同一SEの連打を弾く）
    canPlay(key) {
        if (!this.enabled || !this.ctx) return false;
        if (this.ctx.state !== 'running') {
            this.resumeIfNeeded();
            if (this.ctx.state !== 'running') return false;
        }
        if (this.activeVoices >= this.maxVoices) return false;
        const now = this.ctx.currentTime;
        const last = this.lastPlayed[key];
        if (last !== undefined && now - last < this.minRetriggerInterval) return false;
        this.lastPlayed[key] = now;
        return true;
    }

    // 発音ノードを生成し、終了時に同時発音数を戻す
    trackVoice(node) {
        // start() が成功した時だけ数える（途中で例外になったノードで数が戻らなくなるのを防ぐ）
        const originalStart = node.start.bind(node);
        node.start = (...args) => {
            originalStart(...args);
            this.activeVoices++;
        };
        node.onended = () => {
            this.activeVoices = Math.max(0, this.activeVoices - 1);
            node.disconnect();
        };
        return node;
    }

    createOsc() {
        return this.trackVoice(this.ctx.createOscillator());
    }

    createSource() {
        return this.trackVoice(this.ctx.createBufferSource());
    }

    // 基本のゴツン！激突音（初撃の重い手応え）
    playGotsun(intensity = 1.0) {
        if (!this.canPlay('playGotsun')) return;
        try {
            const t = this.ctx.currentTime;
            
            // 1. 低音インパクト (サブベースのキック)
            const osc = this.createOsc();
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
            const clickOsc = this.createOsc();
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
        if (!this.canPlay('playIronImpact')) return;
        try {
            const t = this.ctx.currentTime;
            
            // 超低音
            const osc1 = this.createOsc();
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
            const osc2 = this.createOsc();
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
        if (!this.canPlay('playPingPong')) return;
        try {
            const t = this.ctx.currentTime;
            const osc = this.createOsc();
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
        if (!this.canPlay('playSpikeHit')) return;
        try {
            const t = this.ctx.currentTime;
            const osc = this.createOsc();
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
        if (!this.canPlay('playBounce')) return;
        try {
            const t = this.ctx.currentTime;
            const osc = this.createOsc();
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
        if (!this.canPlay('playExplosion')) return;
        try {
            const t = this.ctx.currentTime;
            const bufferSize = this.ctx.sampleRate * 0.4;
            const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }

            const noise = this.createSource();
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
            const osc = this.createOsc();
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
        if (!this.canPlay('playBoulder')) return;
        try {
            const t = this.ctx.currentTime;
            const osc = this.createOsc();
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
        if (!this.canPlay('playBooster')) return;
        try {
            const t = this.ctx.currentTime;
            const osc = this.createOsc();
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
        if (!this.canPlay('playPinball')) return;
        try {
            const t = this.ctx.currentTime;
            const osc = this.createOsc();
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
        if (!this.canPlay('playPoko')) return;
        try {
            const t = this.ctx.currentTime;
            const osc = this.createOsc();
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
        if (!this.canPlay('playSpawn')) return;
        try {
            const t = this.ctx.currentTime;
            const osc = this.createOsc();
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
        if (!this.canPlay('playUpgrade')) return;
        try {
            const notes = [523.25, 659.25, 783.99, 1046.50]; // C, E, G, High C
            notes.forEach((freq, idx) => {
                const t = this.ctx.currentTime + idx * 0.06;
                const osc = this.createOsc();
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
        if (!this.canPlay('playMergeSound')) return;
        try {
            const t = this.ctx.currentTime;
            const baseFreq = level === 2 ? 587.33 : 880.00; // D5 または A5
            const notes = [baseFreq, baseFreq * 1.25, baseFreq * 1.5]; // 明るい和音

            notes.forEach((freq, idx) => {
                const noteT = t + idx * 0.045;
                const osc = this.createOsc();
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
            const bassOsc = this.createOsc();
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
        if (!this.canPlay('playVictory')) return;
        try {
            const notes = [440, 554.37, 659.25, 880];
            notes.forEach((freq, idx) => {
                const t = this.ctx.currentTime + idx * 0.12;
                const osc = this.createOsc();
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

    // 敗北時の悲しい下降音
    playDefeat() {
        if (!this.canPlay('playDefeat')) return;
        try {
            const notes = [392.00, 349.23, 293.66, 220.00]; // G, F, D, A (下降)
            notes.forEach((freq, idx) => {
                const t = this.ctx.currentTime + idx * 0.18;
                const osc = this.createOsc();
                const gain = this.ctx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(freq, t);
                osc.frequency.exponentialRampToValueAtTime(freq * 0.6, t + 0.4);
                gain.gain.setValueAtTime(0.35 * this.volume, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(t);
                osc.stop(t + 0.45);
            });
        } catch (e) {}
    }

    // 警告アラートサイレン（巨大ボス登場時）
    playWarningSiren() {
        if (!this.canPlay('playWarningSiren')) return;
        try {
            const t = this.ctx.currentTime;
            for (let i = 0; i < 2; i++) {
                const startT = t + i * 0.35;
                const osc = this.createOsc();
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
        if (!this.canPlay('playCycloneWind')) return;
        try {
            const t = this.ctx.currentTime;
            const osc = this.createOsc();
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
