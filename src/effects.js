/**
 * SakamichiTD - Effects & Board Renderer (手描きスケッチ準拠)
 * 画面シェイク、パーティクル、スピード線、木製板スロープ描画
 */
class EffectManager {
    constructor() {
        this.shakeTime = 0;
        this.shakeDuration = 0;
        this.shakeMagnitude = 0;
        this.shakeX = 0;
        this.shakeY = 0;

        this.hitStopTimer = 0;

        this.particles = [];
        this.damageTexts = [];
        this.bumpers = [];
        this.dashOffset = 0; // 点線矢印アニメーション用

        // WARNING警告演出
        this.warningTimer = 0;
        this.warningDuration = 0;
        this.warningText = '';
        this.warningFlash = 0;

        // BOSS DEFEATED演出
        this.bossDefeatedTimer = 0;
        this.bossDefeatedText = '';
    }

    triggerWarning(text = '⚠️ WARNING! 超巨神タイタン襲来 ⚠️', duration = 3.2) {
        this.warningTimer = duration;
        this.warningDuration = duration;
        this.warningText = text;
        this.triggerShake(14, 0.6);
    }

    triggerBossDefeated(text = '👑 BOSS DEFEATED! 残敵を殲滅せよ！', duration = 3.5) {
        this.bossDefeatedTimer = duration;
        this.bossDefeatedText = text;
        this.triggerShake(16, 0.6);
        this.triggerHitStop(0.08);
    }

    // 揺れは magnitude から duration 秒かけて 0 へ線形に減衰する。
    // 今の揺れ（減衰後）より強い揺れが来たら置き換え、弱ければ今の揺れを続ける
    // （強さと長さを別々に max すると、弱く長い揺れが強い揺れの大きさで続いてしまう）
    triggerShake(magnitude = 6, duration = 0.15) {
        if (duration <= 0) return;
        if (magnitude >= this.currentShakeMagnitude()) {
            this.shakeMagnitude = magnitude;
            this.shakeDuration = duration;
            this.shakeTime = duration;
        }
    }

    currentShakeMagnitude() {
        if (this.shakeTime <= 0 || !this.shakeDuration) return 0;
        return this.shakeMagnitude * Math.min(1, this.shakeTime / this.shakeDuration);
    }

    triggerHitStop(duration = 0.05) {
        this.hitStopTimer = Math.max(this.hitStopTimer, duration);
    }

    // トルネード突風エフェクト（風のリング・竜巻スライス）
    spawnWindBlast(x, y) {
        this.triggerShake(5, 0.15);
        for (let i = 0; i < 16; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 70 + Math.random() * 150;
            this.particles.push({
                x: x,
                y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 50, // 上方向へ吹き上げる
                life: 0.28 + Math.random() * 0.18,
                maxLife: 0.45,
                size: 2.5 + Math.random() * 3,
                color: i % 2 === 0 ? '#00cec9' : '#81ecec',
                type: 'spark'
            });
        }
    }

    spawnImpactSparks(x, y, count = 8, color = '#f1c40f') {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 60 + Math.random() * 140;
            this.particles.push({
                x: x,
                y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 0.25 + Math.random() * 0.2,
                maxLife: 0.4,
                size: 2 + Math.random() * 3,
                color: color,
                type: 'spark'
            });
        }
    }

    // スピード線（進行方向の真後ろに風を放出）
    spawnSpeedLine(x, y, tx, ty, radius, color = 'rgba(255,255,255,0.75)') {
        const speed = 120 + Math.random() * 80;
        const normAngle = Math.atan2(ty, tx) + Math.PI / 2;
        const lateralOffset = (Math.random() - 0.5) * radius * 0.9;
        const ox = Math.cos(normAngle) * lateralOffset;
        const oy = Math.sin(normAngle) * lateralOffset;

        this.particles.push({
            x: x + ox,
            y: y + oy,
            vx: -tx * speed,
            vy: -ty * speed,
            tx: tx,
            ty: ty,
            life: 0.14 + Math.random() * 0.08,
            maxLife: 0.22,
            size: 1.5 + Math.random() * 1.5,
            length: 14 + Math.random() * 16,
            color: color,
            type: 'speedline'
        });
    }

    // ジェット噴射の炎（進行方向の真後ろへ噴出）
    spawnJetFlame(x, y, tx, ty) {
        const speed = 140 + Math.random() * 60;
        this.particles.push({
            x: x - tx * 12 + (Math.random() - 0.5) * 6,
            y: y - ty * 12 + (Math.random() - 0.5) * 6,
            vx: -tx * speed + (Math.random() - 0.5) * 30,
            vy: -ty * speed + (Math.random() - 0.5) * 30,
            life: 0.15,
            maxLife: 0.15,
            size: 3 + Math.random() * 4,
            color: Math.random() > 0.5 ? '#e67e22' : '#f1c40f',
            type: 'jet'
        });
    }

    spawnExplosion(x, y, radius = 70) {
        this.triggerShake(12, 0.35);
        this.triggerHitStop(0.08);

        this.particles.push({
            x: x,
            y: y,
            radius: 5,
            targetRadius: radius * 1.1,
            life: 0.3,
            maxLife: 0.3,
            color: '#e74c3c',
            type: 'shockwave'
        });

        for (let i = 0; i < 28; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 40 + Math.random() * 220;
            this.particles.push({
                x: x,
                y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 0.3 + Math.random() * 0.35,
                maxLife: 0.65,
                size: 4 + Math.random() * 9,
                color: i % 3 === 0 ? '#f39c12' : (i % 3 === 1 ? '#d63031' : '#2d3436'),
                type: 'smoke'
            });
        }
    }

    spawnDamageText(x, y, amount, isCrit = false, color = null) {
        const textColor = color || (isCrit ? '#ff3838' : '#ffffff');
        // 文字列（'GUARD!' や '⚔️ 中ボス出現！' 等）はそのまま出す。数値だけ丸めて CRIT を付ける
        // （以前は文字列も Math.round に通しており、'NaN' / 'CRIT! NaN' と表示されていた）
        const isLabel = typeof amount === 'string';
        this.damageTexts.push({
            x: x + (Math.random() - 0.5) * 16,
            y: y - 5,
            text: isLabel ? amount : (isCrit ? `CRIT! ${Math.round(amount)}` : `${Math.round(amount)}`),
            color: textColor,
            size: isCrit ? 19 : 12,
            life: 0.6,
            maxLife: 0.6,
            vy: -40,
            isCrit: isCrit
        });
    }

    // ジグザグコース用のバンパー配置。座標を固定すると Stage 2（4 段）でコースから外れるため、
    // コース上の位置（総延長に対する割合）から求め、ボールが必ず通る場所に置く
    setupBumpers(coursePath) {
        const layout = [
            { at: 0.14, radius: 22 },
            { at: 0.32, radius: 20 },
            { at: 0.50, radius: 24 },
            { at: 0.68, radius: 20 },
            { at: 0.86, radius: 22 }
        ];
        this.bumpers = layout.map(({ at, radius }) => {
            const pt = coursePath.getPointAt(coursePath.totalLength * at);
            // 板の上側へ少し浮かせる（ボールの中心線と重ならないと当たらない程度に留める）
            return {
                at,
                x: pt.x + pt.nx * 6,
                y: pt.y + pt.ny * 6,
                radius,
                pulse: 0,
                flashTimer: 0,
                hitCooldown: 0
            };
        });
    }

    // ステージ切り替え時に、発動中のバンパーを新しいコースに置き直す
    relayoutBumpers(coursePath) {
        if (this.bumpers.length === 0) return;
        const pulses = this.bumpers.map(b => b.pulse);
        this.setupBumpers(coursePath);
        this.bumpers.forEach((b, i) => { b.pulse = pulses[i] || 0; });
    }

    clearBumpers() {
        this.bumpers = [];
    }

    update(dt, isBoosterActive = false) {
        if (this.hitStopTimer > 0) {
            this.hitStopTimer -= dt;
            return false;
        }

        const dashSpeed = isBoosterActive ? 180 : 60;
        this.dashOffset = (this.dashOffset - dashSpeed * dt) % 40;

        // 画面シェイク
        if (this.shakeTime > 0) {
            this.shakeTime -= dt;
            const currentMag = this.currentShakeMagnitude();
            this.shakeX = (Math.random() - 0.5) * 2 * currentMag;
            this.shakeY = (Math.random() - 0.5) * 2 * currentMag;
        } else {
            this.shakeMagnitude = 0;
            this.shakeDuration = 0;
            this.shakeX = 0;
            this.shakeY = 0;
        }

        // パーティクル更新
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life -= dt;
            if (p.life <= 0) {
                this.particles.splice(i, 1);
                continue;
            }

            if (p.type === 'shockwave') {
                const prog = 1 - (p.life / p.maxLife);
                p.radius = 5 + (p.targetRadius - 5) * prog;
            } else {
                p.x += (p.vx || 0) * dt;
                p.y += (p.vy || 0) * dt;
            }
        }

        // ダメージテキスト更新
        for (let i = this.damageTexts.length - 1; i >= 0; i--) {
            const d = this.damageTexts[i];
            d.life -= dt;
            if (d.life <= 0) {
                this.damageTexts.splice(i, 1);
                continue;
            }
            d.y += d.vy * dt;
        }

        this.bumpers.forEach(b => {
            b.pulse += dt * 5;
            if (b.flashTimer > 0) b.flashTimer -= dt;
        });

        // WARNING警告タイマー更新
        if (this.warningTimer > 0) {
            this.warningTimer = Math.max(0, this.warningTimer - dt);
            this.warningFlash += dt * 8;
        }

        // BOSS DEFEATEDタイマー更新
        if (this.bossDefeatedTimer > 0) {
            this.bossDefeatedTimer = Math.max(0, this.bossDefeatedTimer - dt);
        }

        return true;
    }

    // 手描きスケッチの板（スロープ台）＆ガイド矢印・点線の描画
    renderBoards(ctx, coursePath, isBoosterActive = false) {
        if (!coursePath) return;

        // 1. 各段の長方形の板（木製・トイ風スロープボード）を描画
        coursePath.boards.forEach((board, idx) => {
            ctx.save();

            const dx = board.x2 - board.x1;
            const dy = board.y2 - board.y1;
            const len = Math.hypot(dx, dy);
            const angle = Math.atan2(dy, dx);

            ctx.translate(board.x1, board.y1);
            ctx.rotate(angle);

            // 板の影
            ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
            ctx.fillRect(4, 10, len, board.thickness);

            if (isBoosterActive) {
                // ブースター時のレインボー板
                const rainbow = ctx.createLinearGradient(0, 0, len, 0);
                rainbow.addColorStop(0, '#ff7675');
                rainbow.addColorStop(0.2, '#fdcb6e');
                rainbow.addColorStop(0.4, '#55efc4');
                rainbow.addColorStop(0.6, '#81ecec');
                rainbow.addColorStop(0.8, '#74b9ff');
                rainbow.addColorStop(1, '#a29bfe');
                ctx.fillStyle = rainbow;
            } else {
                // 高級感のある木製スロープボード（スケッチの「板」を再現）
                const woodGrad = ctx.createLinearGradient(0, 0, 0, board.thickness);
                woodGrad.addColorStop(0, '#d35400');
                woodGrad.addColorStop(0.4, '#e67e22');
                woodGrad.addColorStop(1, '#a04000');
                ctx.fillStyle = woodGrad;
            }

            // 板の本体
            ctx.fillRect(0, 0, len, board.thickness);

            // 板の枠線
            ctx.strokeStyle = isBoosterActive ? '#ffffff' : '#78281f';
            ctx.lineWidth = 2.5;
            ctx.strokeRect(0, 0, len, board.thickness);

            // 板の木目ライン
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(10, board.thickness * 0.4);
            ctx.lineTo(len - 10, board.thickness * 0.4);
            ctx.moveTo(25, board.thickness * 0.7);
            ctx.lineTo(len - 25, board.thickness * 0.7);
            ctx.stroke();

            // 板の固定リベット（左右端）
            ctx.fillStyle = '#f1c40f';
            [8, len - 8].forEach(rx => {
                ctx.beginPath();
                ctx.arc(rx, board.thickness / 2, 3, 0, Math.PI * 2);
                ctx.fill();
            });

            ctx.restore();
        });

        // 2. コースパスのガイド点線と三角矢印（スケッチの点線＆矢印を完全再現）
        ctx.save();
        ctx.strokeStyle = isBoosterActive ? '#ffeaa7' : 'rgba(255, 255, 255, 0.45)';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([8, 8]);
        ctx.lineDashOffset = this.dashOffset;

        ctx.beginPath();
        for (let i = 0; i < coursePath.samples.length; i++) {
            const p = coursePath.samples[i];
            if (i === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
        ctx.setLineDash([]); // リセット

        // スケッチ通りの三角矢印マーク（定期的な間隔で配置）
        const stepS = 90;
        for (let s = 50; s < coursePath.totalLength - 40; s += stepS) {
            const pt = coursePath.getPointAt(s);
            ctx.save();
            ctx.translate(pt.x, pt.y);
            ctx.rotate(pt.angle);

            ctx.fillStyle = isBoosterActive ? '#ffffff' : 'rgba(255, 234, 167, 0.75)';
            ctx.beginPath();
            ctx.moveTo(6, 0);
            ctx.lineTo(-6, -5);
            ctx.lineTo(-4, 0);
            ctx.lineTo(-6, 5);
            ctx.closePath();
            ctx.fill();

            ctx.restore();
        }

        ctx.restore();
    }

    render(ctx) {
        // パーティクル
        this.particles.forEach(p => {
            // life の乱数上限が maxLife を超える粒子がある（火花 0.45 > 0.4 等）ため 1 で頭打ちにする
            const alpha = Math.max(0, Math.min(1, p.life / p.maxLife));
            ctx.save();
            ctx.globalAlpha = alpha;

            if (p.type === 'spark' || p.type === 'smoke' || p.type === 'jet') {
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
                ctx.fill();
            } else if (p.type === 'speedline') {
                ctx.strokeStyle = p.color;
                ctx.lineWidth = p.size;
                ctx.beginPath();
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(p.x - (p.tx || 0) * p.length, p.y - (p.ty || 0) * p.length);
                ctx.stroke();
            } else if (p.type === 'shockwave') {
                ctx.strokeStyle = p.color;
                ctx.lineWidth = 4 * alpha;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                ctx.stroke();
            }

            ctx.restore();
        });

        // バンパー
        this.bumpers.forEach(b => {
            ctx.save();
            const glow = b.flashTimer > 0 ? 25 : 10;
            ctx.shadowBlur = glow;
            ctx.shadowColor = '#00f6ff';

            ctx.beginPath();
            ctx.arc(b.x, b.y, b.radius + Math.sin(b.pulse) * 2, 0, Math.PI * 2);
            ctx.fillStyle = b.flashTimer > 0 ? '#ffffff' : '#0984e3';
            ctx.fill();
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#00cec9';
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(b.x, b.y, b.radius * 0.45, 0, Math.PI * 2);
            ctx.fillStyle = '#fab1a0';
            ctx.fill();

            ctx.restore();
        });

        // ダメージテキスト
        this.damageTexts.forEach(d => {
            const alpha = Math.max(0, d.life / d.maxLife);
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.font = `bold ${d.size}px 'Arial Black', sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            ctx.lineWidth = 3;
            ctx.strokeStyle = 'rgba(0,0,0,0.8)';
            ctx.strokeText(d.text, d.x, d.y);

            ctx.fillStyle = d.color;
            ctx.fillText(d.text, d.x, d.y);
            ctx.restore();
        });
    }

    // 画面全体に掛かる帯・暗転。画面揺れの translate の外で描く（帯ごと揺れて暗転の端に隙間が出ないように）
    renderOverlays(ctx) {
        // 7. WARNING警告帯演出（ボス出現時）
        if (this.warningTimer > 0) {
            ctx.save();
            const w = ctx.canvas.width;
            const h = ctx.canvas.height;
            const centerY = h * 0.45;
            const bannerH = 68;

            // 暗転オーバーレイ
            ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
            ctx.fillRect(0, 0, w, h);

            // メイン黒帯
            ctx.fillStyle = 'rgba(15, 15, 20, 0.92)';
            ctx.fillRect(0, centerY - bannerH / 2, w, bannerH);

            // 上下のハザードストライプ帯
            const stripeH = 8;
            const stripeW = 20;
            const offset = (this.warningFlash * 15) % (stripeW * 2);

            // 上ストライプ
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, centerY - bannerH / 2 - stripeH, w, stripeH);
            ctx.clip();
            for (let x = -stripeW * 2 + offset; x < w + stripeW * 2; x += stripeW * 2) {
                ctx.fillStyle = '#f1c40f';
                ctx.fillRect(x, centerY - bannerH / 2 - stripeH, stripeW, stripeH);
                ctx.fillStyle = '#d63031';
                ctx.fillRect(x + stripeW, centerY - bannerH / 2 - stripeH, stripeW, stripeH);
            }
            ctx.restore();

            // 下ストライプ
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, centerY + bannerH / 2, w, stripeH);
            ctx.clip();
            for (let x = -stripeW * 2 - offset; x < w + stripeW * 2; x += stripeW * 2) {
                ctx.fillStyle = '#f1c40f';
                ctx.fillRect(x, centerY + bannerH / 2, stripeW, stripeH);
                ctx.fillStyle = '#d63031';
                ctx.fillRect(x + stripeW, centerY + bannerH / 2, stripeW, stripeH);
            }
            ctx.restore();

            // 警告テキスト点滅
            const alpha = 0.7 + Math.sin(this.warningFlash) * 0.3;
            ctx.globalAlpha = alpha;
            ctx.font = 'bold 20px "Arial Black", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            // 光彩
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#e74c3c';
            ctx.fillStyle = '#ff7675';
            ctx.fillText(this.warningText || '⚠️ WARNING! ⚠️', w / 2, centerY);

            ctx.restore();
        }

        // 8. BOSS DEFEATED 戦況アナウンス帯演出（ボス撃破時）
        if (this.bossDefeatedTimer > 0) {
            ctx.save();
            const w = ctx.canvas.width;
            const centerY = 130;
            const bannerH = 46;

            ctx.fillStyle = 'rgba(20, 20, 25, 0.88)';
            ctx.fillRect(0, centerY - bannerH / 2, w, bannerH);

            ctx.strokeStyle = '#f1c40f';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(0, centerY - bannerH / 2);
            ctx.lineTo(w, centerY - bannerH / 2);
            ctx.moveTo(0, centerY + bannerH / 2);
            ctx.lineTo(w, centerY + bannerH / 2);
            ctx.stroke();

            ctx.font = 'bold 16px "Arial Black", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowBlur = 12;
            ctx.shadowColor = '#f39c12';
            ctx.fillStyle = '#f1c40f';
            ctx.fillText(this.bossDefeatedText || '👑 BOSS DEFEATED! 残敵を殲滅せよ！', w / 2, centerY);

            ctx.restore();
        }
    }
}

window.EffectManager = EffectManager;
