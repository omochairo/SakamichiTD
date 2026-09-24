/**
 * SakamichiTD - Units (Balls, Enemies, Bases)
 * 一本道ジグザグコース上の進行距離 s に基づくユニット挙動と演出
 */

class BaseUnit {
    constructor(s, config, coursePath) {
        this.s = s; // コース上の進行距離
        this.coursePath = coursePath;
        this.radius = config.radius;
        this.maxHp = config.hp;
        this.hp = config.hp;
        this.atk = config.atk;
        this.attackInterval = config.attackInterval;
        this.attackTimer = 0;
        this.pushPower = config.pushPower;
        this.color = config.color;
        this.strokeColor = config.strokeColor;
        this.isAlive = true;

        this.rotation = 0; // 自転角度 (rad)
        this.knockbackS = 0; // ノックバックによる s オフセット
        this.knockbackVelocity = 0;

        // 初期座標の同期
        this.updateCoordinates();
    }

    updateCoordinates() {
        const effectiveS = Math.max(0, Math.min(this.coursePath.totalLength, this.s + this.knockbackS));
        const pt = this.coursePath.getPointAt(effectiveS);
        this.x = pt.x;
        this.y = pt.y;
        this.tx = pt.tx;
        this.ty = pt.ty;
        this.nx = pt.nx;
        this.ny = pt.ny;
        this.angle = pt.angle;
    }

    takeDamage(amount) {
        this.hp -= amount;
        if (this.hp <= 0) {
            this.hp = 0;
            this.isAlive = false;
        }
    }

    applyKnockback(strength) {
        this.knockbackVelocity = strength;
    }

    updateKnockback(dt) {
        if (this.knockbackVelocity !== 0 || this.knockbackS !== 0) {
            this.knockbackS += this.knockbackVelocity * dt;
            this.knockbackVelocity *= Math.pow(0.04, dt);
            this.knockbackS *= Math.pow(0.08, dt);
            if (Math.abs(this.knockbackS) < 0.5) this.knockbackS = 0;
            if (Math.abs(this.knockbackVelocity) < 1) this.knockbackVelocity = 0;
        }
    }
}

// 味方ボールクラス (s: 0 -> totalLength へ前進)
class Ball extends BaseUnit {
    constructor(s, typeKey, coursePath, relicState = {}) {
        const config = BALL_TYPES[typeKey];
        super(s, config, coursePath);
        this.typeKey = typeKey;
        this.config = config;

        this.baseSpeed = config.baseSpeed;
        this.maxSpeed = config.maxSpeed;
        this.currentSpeed = config.baseSpeed;

        this.spinMultiplier = config.spinMultiplier || 1.0;
        this.isStopped = false; // 前線衝突による停止
        this.isFirstHit = true;  // 初撃激突ボーナスフラグ

        this.distanceTravelled = 0; // 雪だるま巨大化計算用
        this.scaleMultiplier = 1.0;

        // マージ合体進化システム (Lv.1 -> Lv.2 -> Lv.3 MAX)
        this.mergeLevel = 1;
        this.mergeScaleAnim = 1.0;

        // スーパーボールの跳ね挙動用
        this.jumpPhase = 0;
        this.jumpHeight = 0;

        // トゲ玉の継続ダメージタイマー
        this.spikeTimer = 0;

        // レリックによる初期補正
        if (relicState.jet_engine) {
            this.baseSpeed += 80;
            this.maxSpeed += 120;
            this.pushPower += 2;
            this.hasJet = true;
        }

        this.relicState = relicState;
    }

    // 同種ボールとの合体進化
    applyMerge(other) {
        if (this.mergeLevel >= 3) return false;
        this.mergeLevel++;

        // ステータス合算＆インフレ強化
        this.maxHp = Math.round((this.maxHp + other.maxHp) * 1.35);
        this.hp = this.maxHp; // 体力全快
        this.atk = Math.round(this.atk * 1.85);
        this.pushPower += (other.pushPower + 1);
        this.scaleMultiplier = Math.min(2.8, this.scaleMultiplier * 1.3);

        // ボムボールの爆発範囲拡張
        if (this.config.isBomb) {
            this.config.explosionRadius = Math.round((this.config.explosionRadius || 95) * 1.35);
            this.atk = Math.round(this.atk * 1.6);
        }

        // スケールポップアニメーション
        this.mergeScaleAnim = 1.45;
        this.isFirstHit = true; // 初撃ボーナスを再付与！

        return true;
    }

    update(dt, effectManager, isBoosterActive = false) {
        this.updateKnockback(dt);

        // マージポップアニメーションの減衰
        if (this.mergeScaleAnim > 1.0) {
            this.mergeScaleAnim = Math.max(1.0, this.mergeScaleAnim - dt * 3.5);
        }

        const speedMult = isBoosterActive ? 3.0 : 1.0;

        if (!this.isStopped) {
            // 坂道による加速 (擬似重力)
            this.currentSpeed = Math.min(
                this.maxSpeed,
                this.currentSpeed + GAME_CONFIG.GRAVITY_ACCEL * dt * 2.5
            );

            const effectiveSpeed = this.currentSpeed * speedMult;
            const deltaS = effectiveSpeed * dt;
            this.s += deltaS;
            this.distanceTravelled += deltaS;

            // 自転回転（進行方向に向かって板の上を転がる）
            // 水平速度 tx が負（左進行）のときは反時計、正（右進行）のときは時計回り
            const spinDir = this.tx >= 0 ? 1 : -1;
            this.rotation += spinDir * (deltaS / (this.radius * this.scaleMultiplier)) * this.spinMultiplier;

            // 雪だるま式（ジャイアント）レリック
            if (this.relicState.snowman_growth) {
                const growth = Math.min(2.5, 1.0 + (this.distanceTravelled / 600) * 1.5);
                this.scaleMultiplier = growth;
                this.pushPower = Math.round(this.config.pushPower * growth);
            }

            // スーパーボールのピョンピョン跳ね
            if (this.config.id === 'super') {
                this.jumpPhase += dt * 9;
                this.jumpHeight = Math.abs(Math.sin(this.jumpPhase)) * 26;
                if (Math.abs(Math.sin(this.jumpPhase)) < 0.1 && Math.random() < 0.2) {
                    window.soundEngine.playBounce();
                }
            }

            // スピード線演出 (進行方向の逆向きに放出)
            if (this.currentSpeed >= this.maxSpeed * 0.8 || isBoosterActive) {
                if (Math.random() < 0.45) {
                    const r = this.radius * this.scaleMultiplier;
                    effectManager.spawnSpeedLine(
                        this.x,
                        this.y,
                        this.tx,
                        this.ty,
                        r,
                        isBoosterActive ? '#ff9ff3' : 'rgba(255,255,255,0.75)'
                    );
                }
            }

            // ジェット噴射の炎パーティクル
            if (this.hasJet && Math.random() < 0.5) {
                effectManager.spawnJetFlame(this.x, this.y, this.tx, this.ty);
            }

            // ボムボールの導火線火花
            if (this.config.isBomb && Math.random() < 0.6) {
                effectManager.spawnImpactSparks(this.x, this.y, 2, '#ff9f43');
            }
        } else {
            this.attackTimer += dt;
            if (this.config.id === 'spike') {
                this.spikeTimer += dt;
            }
        }

        // コース幾何座標の再同期
        this.updateCoordinates();
    }

    render(ctx) {
        ctx.save();

        const curRadius = this.radius * this.scaleMultiplier;

        // スーパーボールの跳ね（板の法線方向へオフセット）
        const renderX = this.x + (this.nx || 0) * (this.jumpHeight || 0);
        const renderY = this.y + (this.ny || 0) * (this.jumpHeight || 0);

        // スーパーボールの影（板の上）
        if (this.jumpHeight > 0) {
            ctx.save();
            ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.beginPath();
            const shadowScale = Math.max(0.4, 1.0 - this.jumpHeight / 40);
            ctx.ellipse(this.x, this.y, curRadius * shadowScale, curRadius * 0.4 * shadowScale, this.angle, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // ロケットノズル（ジェット噴射）
        if (this.hasJet) {
            ctx.save();
            ctx.translate(renderX, renderY);
            ctx.rotate(this.angle);
            ctx.fillStyle = '#636e72';
            ctx.fillRect(-curRadius - 8, -4, 8, 8);
            ctx.fillStyle = '#d63031';
            ctx.beginPath();
            ctx.moveTo(-curRadius - 8, -4);
            ctx.lineTo(-curRadius - 8, 4);
            ctx.lineTo(-curRadius - 16, 0);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }

        // ボール本体
        ctx.translate(renderX, renderY);
        ctx.rotate(this.rotation);

        // 1. ボール下地・立体シェーディング
        const grad = ctx.createRadialGradient(
            -curRadius * 0.35, -curRadius * 0.35, curRadius * 0.1,
            0, 0, curRadius
        );

        if (this.config.id === 'pingpong') {
            grad.addColorStop(0, '#ffffff');
            grad.addColorStop(0.7, '#fffae0');
            grad.addColorStop(1, '#e67e22');
        } else if (this.config.id === 'iron') {
            grad.addColorStop(0, '#ecf0f1');
            grad.addColorStop(0.5, '#95a5a6');
            grad.addColorStop(1, '#2c3e50');
        } else if (this.config.id === 'spike') {
            grad.addColorStop(0, '#ff7675');
            grad.addColorStop(0.7, '#d63031');
            grad.addColorStop(1, '#631818');
        } else if (this.config.id === 'super') {
            grad.addColorStop(0, '#55efc4');
            grad.addColorStop(0.6, '#00cec9');
            grad.addColorStop(1, '#0984e3');
        } else if (this.config.id === 'bomb') {
            grad.addColorStop(0, '#636e72');
            grad.addColorStop(0.6, '#2d3436');
            grad.addColorStop(1, '#1e272e');
        } else {
            grad.addColorStop(0, '#ffffff');
            grad.addColorStop(1, this.color);
        }

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, curRadius, 0, Math.PI * 2);
        ctx.fill();

        // 2. 自転模様
        ctx.strokeStyle = this.strokeColor;
        ctx.lineWidth = Math.max(2, curRadius * 0.12);

        if (this.config.id === 'pingpong') {
            ctx.beginPath();
            ctx.arc(0, 0, curRadius * 0.65, 0.2, Math.PI * 1.8);
            ctx.stroke();
            ctx.fillStyle = '#d35400';
            ctx.beginPath();
            ctx.arc(curRadius * 0.4, 0, curRadius * 0.2, 0, Math.PI * 2);
            ctx.fill();
        } else if (this.config.id === 'iron') {
            ctx.beginPath();
            ctx.moveTo(-curRadius * 0.7, 0);
            ctx.lineTo(curRadius * 0.7, 0);
            ctx.moveTo(0, -curRadius * 0.7);
            ctx.lineTo(0, curRadius * 0.7);
            ctx.stroke();

            ctx.fillStyle = '#bdc3c7';
            [-curRadius * 0.4, curRadius * 0.4].forEach(offset => {
                ctx.beginPath();
                ctx.arc(offset, 0, 2.5, 0, Math.PI * 2);
                ctx.fill();
            });
        } else if (this.config.id === 'spike') {
            ctx.fillStyle = '#c0392b';
            for (let i = 0; i < 8; i++) {
                const angle = (i * Math.PI) / 4;
                ctx.save();
                ctx.rotate(angle);
                ctx.beginPath();
                ctx.moveTo(-curRadius * 0.25, curRadius * 0.85);
                ctx.lineTo(0, curRadius * 1.35);
                ctx.lineTo(curRadius * 0.25, curRadius * 0.85);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
            }
        } else if (this.config.id === 'super') {
            ctx.fillStyle = '#ff7675';
            ctx.beginPath();
            ctx.arc(0, 0, curRadius, 0, Math.PI);
            ctx.fill();
        } else if (this.config.id === 'bomb') {
            ctx.fillStyle = '#e74c3c';
            ctx.beginPath();
            ctx.arc(0, 0, curRadius * 0.4, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#d35400';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(0, -curRadius);
            ctx.quadraticCurveTo(curRadius * 0.4, -curRadius * 1.3, curRadius * 0.2, -curRadius * 1.5);
            ctx.stroke();
        }

        ctx.restore();

        // マージ合体レベルバッジの描画 (Lv.2: ★, Lv.3: ★★ MAX)
        if (this.mergeLevel >= 2) {
            ctx.save();
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const badgeY = renderY - curRadius - 8;
            
            // 背景プレート
            ctx.fillStyle = this.mergeLevel === 2 ? '#2980b9' : '#f1c40f';
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            const badgeText = this.mergeLevel === 2 ? '★Lv.2' : '★★MAX';
            const tw = ctx.measureText(badgeText).width + 8;
            ctx.fillRect(renderX - tw / 2, badgeY - 7, tw, 14);
            ctx.strokeRect(renderX - tw / 2, badgeY - 7, tw, 14);

            ctx.fillStyle = this.mergeLevel === 2 ? '#ffffff' : '#2c3e50';
            ctx.fillText(badgeText, renderX, badgeY);
            ctx.restore();
        }

        // HPバー
        if (this.hp < this.maxHp) {
            this.renderHpBar(ctx, renderX, renderY, curRadius);
        }
    }

    renderHpBar(ctx, rx, ry, curRadius) {
        ctx.save();
        const totalHp = this.maxHp;
        const barW = Math.max(26, curRadius * 2);
        const barH = 4;
        const bx = rx - barW / 2;
        const by = ry - curRadius - (this.mergeLevel >= 2 ? 18 : 8);

        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(bx, by, barW, barH);

        const fillW = Math.max(0, (this.hp / totalHp) * barW);
        ctx.fillStyle = '#2ecc71';
        ctx.fillRect(bx, by, fillW, barH);
        ctx.restore();
    }
}

// 敵ユニットクラス (s: totalLength -> 0 へ坂を上る)
class Enemy extends BaseUnit {
    constructor(s, typeKey, coursePath) {
        const config = ENEMY_TYPES[typeKey];
        super(s, config, coursePath);
        this.typeKey = typeKey;
        this.config = config;
        this.speed = config.speed;
        this.isStopped = false;
        this.manaReward = config.manaReward;
        this.isBoss = config.isBoss || false;
        this.walkAnim = 0;

        // マージ合体システム (Lv.1 -> Lv.2 エリート)
        this.mergeLevel = 1;
        this.mergeScaleAnim = 1.0;
        this.scaleMultiplier = 1.0;

        // 特殊特性フラグ
        this.isAreaAttack = config.isAreaAttack || false;
        this.isRanged = config.isRanged || false;
        this.attackRange = config.attackRange || 0;
        this.isAcidSuicide = config.isAcidSuicide || false;
        this.isGhost = config.isGhost || false;
        this.immuneKnockback = config.immuneKnockback || false;
        this.shieldGuard = config.shieldGuard || 1.0;

        // 吹き飛ばし突風ゴーレム特性
        this.isTornado = config.isTornado || false;
        this.repelForce = config.repelForce || 0;
        this.tornadoAnim = 0;

        // 超巨神タイタンボス特性
        this.isTitan = config.isTitan || false;
        this.bossArmor = config.bossArmor || 0;
        this.roarInterval = config.roarInterval || 0;
        this.roarTimer = 0;
        this.titanAuraPulse = 0;

        this.ghostFlicker = 0;
    }

    takeDamage(amount) {
        if (this.bossArmor > 0) {
            amount *= (1.0 - this.bossArmor);
        }
        super.takeDamage(amount);
    }

    // 敵の同種マージ合体（エリート化）
    applyMerge(other) {
        if (this.mergeLevel >= 2 || this.isBoss) return false;
        this.mergeLevel++;

        this.maxHp = Math.round((this.maxHp + other.maxHp) * 1.3);
        this.hp = this.maxHp;
        this.atk = Math.round(this.atk * 1.7);
        this.pushPower += (other.pushPower + 1);
        this.scaleMultiplier = 1.35;
        this.mergeScaleAnim = 1.4;
        this.manaReward = Math.round(this.manaReward * 2.2);

        return true;
    }

    update(dt) {
        this.updateKnockback(dt);

        if (this.mergeScaleAnim > 1.0) {
            this.mergeScaleAnim = Math.max(1.0, this.mergeScaleAnim - dt * 3.5);
        }

        if (this.isGhost) {
            this.ghostFlicker += dt * 8;
        }

        if (this.isTornado) {
            this.tornadoAnim += dt * 6;
        }

        if (this.isTitan) {
            this.titanAuraPulse += dt * 4;
        }

        if (!this.isStopped) {
            // コースを逆走（s が減少）
            const deltaS = this.speed * dt;
            this.s -= deltaS;
            this.walkAnim += dt * 7;

            // 敵も坂を登る方向（進行方向逆）に自転
            const spinDir = this.tx >= 0 ? -1 : 1;
            this.rotation += spinDir * (deltaS / this.radius) * 0.8;
        } else {
            this.attackTimer += dt;
        }

        this.updateCoordinates();
    }

    render(ctx) {
        ctx.save();

        // ゴーストは半透明浮遊
        if (this.isGhost) {
            ctx.globalAlpha = 0.55 + Math.sin(this.ghostFlicker) * 0.25;
        }

        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);

        // 1. 球体グラデーション
        const grad = ctx.createRadialGradient(
            -this.radius * 0.35, -this.radius * 0.35, this.radius * 0.1,
            0, 0, this.radius
        );

        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.3, this.color);
        grad.addColorStop(1, this.strokeColor);

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = this.strokeColor;
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // 2. 敵種別の専用パーツ描画
        if (this.typeKey === 'BULLDOZER') {
            // 重装ブルドーザーの前面巨大ショベルブレード
            ctx.fillStyle = '#2c3e50';
            ctx.strokeStyle = '#e74c3c';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.rect(-this.radius * 1.25, -this.radius * 0.6, 6, this.radius * 1.2);
            ctx.fill();
            ctx.stroke();
            // ショベルのツメ
            ctx.fillStyle = '#f1c40f';
            for (let ty = -this.radius * 0.5; ty <= this.radius * 0.5; ty += 8) {
                ctx.fillRect(-this.radius * 1.35, ty - 2, 4, 4);
            }
        } else if (this.typeKey === 'SHIELD') {
            // 重装シールド兵のフロント大盾
            ctx.fillStyle = '#7f8c8d';
            ctx.strokeStyle = '#bdc3c7';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(-this.radius * 0.8, 0, this.radius * 0.8, -Math.PI / 3, Math.PI / 3);
            ctx.stroke();
        } else if (this.typeKey === 'ARCHER') {
            // スケルトン・アーチャーの骨格＆弓
            ctx.strokeStyle = '#85280c';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(-this.radius * 0.6, 0, this.radius * 0.7, -Math.PI / 2.5, Math.PI / 2.5);
            ctx.stroke();
            // 矢
            ctx.fillStyle = '#f39c12';
            ctx.fillRect(-this.radius * 1.1, -1.5, this.radius * 0.9, 3);
        } else if (this.typeKey === 'ACID_SLIME') {
            // 酸液スライムの泡立ちドット
            ctx.fillStyle = '#55efc4';
            [-4, 3].forEach((ox, i) => {
                ctx.beginPath();
                ctx.arc(ox, -3 + i * 6, 3, 0, Math.PI * 2);
                ctx.fill();
            });
        } else if (this.isTornado || this.typeKey === 'TORNADO_GOLEM') {
            // トルネード・ゴーレムの渦巻く突風エフェクト
            ctx.strokeStyle = '#81ecec';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(0, 0, this.radius * 1.25, this.tornadoAnim, this.tornadoAnim + Math.PI * 0.9);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(0, 0, this.radius * 1.25, this.tornadoAnim + Math.PI, this.tornadoAnim + Math.PI * 1.9);
            ctx.stroke();

            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(0, 0, this.radius * 0.7, -this.tornadoAnim * 1.5, -this.tornadoAnim * 1.5 + Math.PI * 0.7);
            ctx.stroke();
        }

        // タイタンボスの禍々しい赤黒オーラ脈動
        if (this.isTitan) {
            ctx.save();
            const pulseSize = this.radius * 1.2 + Math.sin(this.titanAuraPulse) * 4;
            ctx.strokeStyle = 'rgba(214, 48, 49, 0.6)';
            ctx.lineWidth = 3;
            ctx.setLineDash([8, 6]);
            ctx.beginPath();
            ctx.arc(0, 0, pulseSize, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        // 3. 威嚇フェイス
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(-this.radius * 0.35, -this.radius * 0.2, this.radius * 0.22, 0, Math.PI * 2);
        ctx.arc(this.radius * 0.35, -this.radius * 0.2, this.radius * 0.22, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = this.isTitan ? '#d63031' : '#000000';
        ctx.beginPath();
        ctx.arc(-this.radius * 0.35, -this.radius * 0.25, this.radius * (this.isTitan ? 0.14 : 0.1), 0, Math.PI * 2);
        ctx.arc(this.radius * 0.35, -this.radius * 0.25, this.radius * (this.isTitan ? 0.14 : 0.1), 0, Math.PI * 2);
        ctx.fill();

        if (this.isTitan) {
            // 超巨神タイタンの5連重装王冠
            ctx.fillStyle = '#f1c40f';
            ctx.strokeStyle = '#b71540';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(-this.radius * 0.8, -this.radius * 0.7);
            ctx.lineTo(-this.radius * 0.6, -this.radius * 1.4);
            ctx.lineTo(-this.radius * 0.3, -this.radius * 0.9);
            ctx.lineTo(0, -this.radius * 1.6); // 中央の特大尖塔
            ctx.lineTo(this.radius * 0.3, -this.radius * 0.9);
            ctx.lineTo(this.radius * 0.6, -this.radius * 1.4);
            ctx.lineTo(this.radius * 0.8, -this.radius * 0.7);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // 王冠の宝玉
            ctx.fillStyle = '#d63031';
            ctx.beginPath();
            ctx.arc(0, -this.radius * 1.05, 4.5, 0, Math.PI * 2);
            ctx.fill();
        } else if (this.isBoss) {
            ctx.fillStyle = '#f1c40f';
            ctx.beginPath();
            ctx.moveTo(-this.radius * 0.6, -this.radius * 0.8);
            ctx.lineTo(-this.radius * 0.3, -this.radius * 1.3);
            ctx.lineTo(0, -this.radius * 0.9);
            ctx.lineTo(this.radius * 0.3, -this.radius * 1.3);
            ctx.lineTo(this.radius * 0.6, -this.radius * 0.8);
            ctx.closePath();
            ctx.fill();
        }

        ctx.restore();

        // ボス／エリート敵バッジ
        if (this.isTitan) {
            ctx.save();
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const badgeY = this.y - this.radius - 20;
            ctx.fillStyle = '#1e272e';
            ctx.strokeStyle = '#e74c3c';
            ctx.lineWidth = 2;
            const tw = ctx.measureText('👑 TITAN BOSS 👑').width + 12;
            ctx.fillRect(this.x - tw / 2, badgeY - 8, tw, 16);
            ctx.strokeRect(this.x - tw / 2, badgeY - 8, tw, 16);
            ctx.fillStyle = '#ff7675';
            ctx.fillText('👑 TITAN BOSS 👑', this.x, badgeY);
            ctx.restore();
        } else if (this.mergeLevel >= 2 && !this.isBoss) {
            ctx.save();
            ctx.font = 'bold 10px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const badgeY = this.y - this.radius - 16;
            ctx.fillStyle = '#c0392b';
            ctx.strokeStyle = '#f1c40f';
            ctx.lineWidth = 1.5;
            const tw = ctx.measureText('★ELITE').width + 8;
            ctx.fillRect(this.x - tw / 2, badgeY - 6, tw, 13);
            ctx.strokeRect(this.x - tw / 2, badgeY - 6, tw, 13);
            ctx.fillStyle = '#ffffff';
            ctx.fillText('★ELITE', this.x, badgeY);
            ctx.restore();
        }

        // 敵HPバー
        this.renderHpBar(ctx);
    }

    renderHpBar(ctx) {
        ctx.save();
        const barW = this.isTitan ? 90 : Math.max(28, this.radius * 2);
        const barH = this.isTitan ? 7 : 5;
        const bx = this.x - barW / 2;
        const by = this.y - this.radius - (this.isTitan ? 10 : 9);

        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(bx, by, barW, barH);

        const fillW = Math.max(0, (this.hp / this.maxHp) * barW);
        ctx.fillStyle = this.isTitan ? '#d63031' : (this.isBoss ? '#e74c3c' : '#e67e22');
        ctx.fillRect(bx, by, fillW, barH);

        if (this.isTitan) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            ctx.strokeRect(bx, by, barW, barH);
        }
        ctx.restore();
    }
}

// 拠点クラス（自陣ゲート・敵要塞：スケッチのデザインに忠実化）
class BaseBuilding {
    constructor(pos, maxHp, isAlly = false) {
        this.x = pos.x;
        this.y = pos.y;
        this.radius = pos.radius || 30;
        this.maxHp = maxHp;
        this.hp = maxHp;
        this.isAlly = isAlly;
        this.hitFlash = 0;
        this.hasBarrier = false; // 敵要塞のフォースバリア（Wave 1〜3早期クリア防止）
        this.barrierPulse = 0;
    }

    takeDamage(amount) {
        if (this.hasBarrier) return false;
        this.hp -= amount;
        this.hitFlash = 0.12;
        if (this.hp <= 0) {
            this.hp = 0;
        }
        return true;
    }

    heal(amount) {
        this.hp = Math.min(this.maxHp, this.hp + amount);
    }

    update(dt) {
        if (this.hitFlash > 0) this.hitFlash -= dt;
        if (this.hasBarrier) this.barrierPulse += dt * 4;
    }

    render(ctx) {
        ctx.save();

        if (this.isAlly) {
            // 右上: 自陣ゲート（ボール投入ファンネル・ホッパー）
            ctx.save();
            ctx.translate(this.x, this.y);

            // ホッパー外枠
            ctx.fillStyle = this.hitFlash > 0 ? '#ffffff' : '#2980b9';
            ctx.strokeStyle = '#0984e3';
            ctx.lineWidth = 3;

            // 漏斗形状
            ctx.beginPath();
            ctx.moveTo(-28, -25);
            ctx.lineTo(28, -25);
            ctx.lineTo(14, 15);
            ctx.lineTo(-14, 15);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // 投入口のリング
            ctx.fillStyle = '#00cec9';
            ctx.beginPath();
            ctx.ellipse(0, -25, 28, 8, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // 下向き矢印マーク
            ctx.fillStyle = '#f5f6fa';
            ctx.beginPath();
            ctx.moveTo(-7, -8);
            ctx.lineTo(7, -8);
            ctx.lineTo(0, 5);
            ctx.closePath();
            ctx.fill();

            // ラベル
            ctx.fillStyle = '#4bcffa';
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('🏰 自陣ゲート', 0, 32);

            ctx.restore();
        } else {
            // 左下: 敵要塞（スケッチの三角屋根＋円筒ベースの要塞タワー）
            ctx.save();
            ctx.translate(this.x, this.y);

            // 円筒の土台ベース
            ctx.fillStyle = this.hitFlash > 0 ? '#ffffff' : '#4a081a';
            ctx.strokeStyle = '#b71540';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 5, 26, 0, Math.PI);
            ctx.lineTo(26, -10);
            ctx.lineTo(-26, -10);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // 要塞の門（黒いアーチ）
            ctx.fillStyle = '#1e272e';
            ctx.beginPath();
            ctx.arc(0, 10, 12, Math.PI, 0);
            ctx.fill();

            // スケッチ通りの大きな三角屋根
            ctx.fillStyle = this.hitFlash > 0 ? '#ffffff' : '#d63031';
            ctx.strokeStyle = '#78281f';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(0, -42);   // 屋根の頂点
            ctx.lineTo(34, -10);  // 右下の軒
            ctx.lineTo(-34, -10); // 左下の軒
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // 屋根の旗
            ctx.fillStyle = '#f1c40f';
            ctx.beginPath();
            ctx.moveTo(0, -42);
            ctx.lineTo(0, -56);
            ctx.lineTo(14, -49);
            ctx.closePath();
            ctx.fill();

            // ラベル
            ctx.fillStyle = '#ff7675';
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('💀 敵軍要塞', 0, 42);

            // バリア展開中のフォースフィールドドーム
            if (this.hasBarrier) {
                ctx.save();
                const domeRadius = 46 + Math.sin(this.barrierPulse) * 2;
                ctx.strokeStyle = '#00cec9';
                ctx.lineWidth = 2.5;
                ctx.shadowBlur = 10;
                ctx.shadowColor = '#00cec9';
                ctx.fillStyle = 'rgba(0, 206, 201, 0.16)';
                ctx.beginPath();
                ctx.arc(0, -10, domeRadius, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();

                // 内側リング
                ctx.setLineDash([5, 4]);
                ctx.strokeStyle = '#81ecec';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(0, -10, domeRadius - 6, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();

                // バリアテキスト
                ctx.fillStyle = '#81ecec';
                ctx.font = 'bold 10px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('🛡️ 防壁展開中 (敵部隊全滅で解除)', 0, -66);
            }

            ctx.restore();
        }

        ctx.restore();
    }
}

window.Ball = Ball;
window.Enemy = Enemy;
window.BaseBuilding = BaseBuilding;
