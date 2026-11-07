/**
 * SakamichiTD - Skills & Relics Manager (一本道ジグザグコース対応)
 */
// ピンボール・フィーバーで 1 つのバンパーが発動する最小間隔（秒）。1 回の発動で周囲の敵に 36 ダメージ
const PINBALL_HIT_INTERVAL = 0.2;

class SkillManager {
    constructor() {
        this.cooldowns = {
            giga_rock: 0,
            booster_slope: 0,
            pinball_fever: 0
        };

        this.boosterTimer = 0;
        this.pinballTimer = 0;
        this.activeGigaRock = null;

        this.combatManager = null;
        this.effectManager = null;
        this.activeRelics = [];
        this.relicState = {};
        this.coursePath = null;
    }

    init(combatManager, effectManager, relicState, coursePath) {
        this.combatManager = combatManager;
        this.effectManager = effectManager;
        this.relicState = relicState;
        this.coursePath = coursePath;
    }

    setCoursePath(coursePath) {
        this.coursePath = coursePath;
    }

    update(dt) {
        for (const k in this.cooldowns) {
            if (this.cooldowns[k] > 0) {
                this.cooldowns[k] = Math.max(0, this.cooldowns[k] - dt);
            }
        }

        if (this.boosterTimer > 0) {
            this.boosterTimer -= dt;
        }

        if (this.pinballTimer > 0) {
            this.pinballTimer -= dt;
            this.updatePinballCollisions(dt);
            if (this.pinballTimer <= 0) {
                this.effectManager.clearBumpers();
            }
        }

        if (this.activeGigaRock) {
            this.updateGigaRock(dt);
        }
    }

    triggerSkill(skillId) {
        if (this.cooldowns[skillId] > 0) return false;

        const config = SPECIAL_SKILLS[skillId.toUpperCase()];
        if (!config) return false;

        this.cooldowns[skillId] = config.cooldown;

        if (skillId === 'giga_rock') {
            this.launchGigaRock();
        } else if (skillId === 'booster_slope') {
            this.activateBoosterSlope();
        } else if (skillId === 'pinball_fever') {
            this.activatePinballFever();
        }

        return true;
    }

    // 1. ギガロック（大落石）: 右上からジグザグの板をゴロゴロ急降下！
    launchGigaRock() {
        this.activeGigaRock = {
            s: 0,
            radius: 38,
            speed: 520,
            rotation: 0,
            damage: 320,
            // 巻き込んだ敵ごとの未表示ダメージ。毎フレーム出すと表示が溢れるので一定間隔でまとめて出す
            pendingDamage: new Map(),
            textTimer: 0
        };
        this.effectManager.triggerShake(10, 0.6);
        window.soundEngine.playBoulder();
    }

    updateGigaRock(dt) {
        const rock = this.activeGigaRock;
        rock.s += rock.speed * dt;

        // 幾何座標取得
        const pt = this.coursePath.getPointAt(rock.s);
        rock.x = pt.x;
        rock.y = pt.y;

        const spinDir = pt.tx >= 0 ? 1 : -1;
        rock.rotation += spinDir * (rock.speed * dt / rock.radius) * 1.5;

        this.effectManager.triggerShake(4, 0.1);

        // 煙パーティクル
        if (Math.random() < 0.6) {
            this.effectManager.spawnImpactSparks(rock.x, rock.y, 3, '#7f8c8d');
        }

        // 道中の敵を全員巻き込んで下へ押し流す（岩が前面に押し出し続けるのでノックバックは掛けない）
        for (const enemy of this.combatManager.enemies) {
            if (!enemy.isAlive) continue;
            const distS = enemy.s - rock.s;
            if (Math.abs(distS) < rock.radius + enemy.radius + 15) {
                // 敵を岩の前面に押し出す
                enemy.s = Math.min(this.coursePath.totalLength, rock.s + rock.radius + enemy.radius);
                enemy.updateCoordinates();
                const dmg = rock.damage * dt * 4.5;
                enemy.takeDamage(dmg);
                rock.pendingDamage.set(enemy, (rock.pendingDamage.get(enemy) || 0) + dmg);
            }
        }

        rock.textTimer += dt;
        if (rock.textTimer >= 0.25) {
            rock.textTimer = 0;
            this.flushGigaRockDamageTexts(rock);
        }

        // 敵拠点に激突
        if (rock.s >= this.coursePath.totalLength - 10) {
            this.flushGigaRockDamageTexts(rock);
            this.combatManager.enemyBase.takeDamage(380);
            this.effectManager.spawnExplosion(this.coursePath.enemyBase.x, this.coursePath.enemyBase.y, 110);
            this.effectManager.triggerShake(16, 0.45);
            window.soundEngine.playExplosion();
            this.activeGigaRock = null;
        }
    }

    // 前回表示してから溜まった実ダメージを、敵ごとに 1 つの数字で出す
    flushGigaRockDamageTexts(rock) {
        for (const [enemy, amount] of rock.pendingDamage) {
            if (amount >= 1) {
                this.effectManager.spawnDamageText(enemy.x, enemy.y, amount, true, '#d35400');
            }
        }
        rock.pendingDamage.clear();
    }

    // 2. ブースター・スロープ
    activateBoosterSlope() {
        this.boosterTimer = 10.0;
        this.effectManager.triggerShake(5, 0.3);
        window.soundEngine.playBooster();
    }

    isBoosterActive() {
        return this.boosterTimer > 0;
    }

    // 3. ピンボール・フィーバー
    activatePinballFever() {
        this.pinballTimer = 12.0;
        this.effectManager.setupBumpers(this.coursePath);
        this.effectManager.triggerShake(6, 0.25);
        window.soundEngine.playPinball(1.2);
        // 出ている間はマナの回復が 3 倍（game.js の isPinballManaBoost）。発動したことが分かるよう文字を出す
        const gate = this.coursePath && this.coursePath.allyGate;
        if (gate) this.effectManager.spawnDamageText(gate.x, gate.y + 45, '⚡ マナ回復×3', true, '#00d2d3');
    }

    updatePinballCollisions(dt) {
        const bumpers = this.effectManager.bumpers;
        for (const b of bumpers) {
            if (b.hitCooldown > 0) b.hitCooldown -= dt;
        }
        for (const ally of this.combatManager.allies) {
            if (!ally.isAlive) continue;
            for (const b of bumpers) {
                // 1 つのバンパーは PINBALL_HIT_INTERVAL 秒に 1 回だけ発動する
                // （重なっている間ずっと毎フレーム当たると、ダメージがフレームレートに比例してしまう）
                if (b.hitCooldown > 0) continue;
                const dist = Math.hypot(ally.x - b.x, ally.y - b.y);
                const minDist = ally.radius * ally.scaleMultiplier + b.radius;
                if (dist < minDist) {
                    b.hitCooldown = PINBALL_HIT_INTERVAL;
                    b.flashTimer = 0.15;
                    this.effectManager.triggerShake(4, 0.08);
                    window.soundEngine.playPinball(1.0 + Math.random() * 0.4);

                    // 敵にタコ殴りダメージ
                    for (const enemy of this.combatManager.enemies) {
                        if (!enemy.isAlive) continue;
                        const enemyDist = Math.hypot(enemy.x - b.x, enemy.y - b.y);
                        if (enemyDist < b.radius * 3.0) {
                            enemy.takeDamage(36);
                            enemy.applyKnockback(25);
                            this.effectManager.spawnDamageText(enemy.x, enemy.y, 36, true, '#00d2d3');
                            this.effectManager.spawnImpactSparks(enemy.x, enemy.y, 6, '#00f6ff');
                        }
                    }
                }
            }
        }
    }

    // 仕様: レリックは各 1 回だけ取得でき、重ねがけはしない。
    // 周回で全種類を取り終えたら空配列を返し、Wave クリア時の 3 択は出さずに次の Wave へ進む。
    // （以前は全種類から再抽選していたが、取り直して効果が重なるのは ink_overdrive と
    //  fortress_repair だけで、他は何も起きない選択肢になっていた）
    getRandomRelicOptions(count = 3) {
        const available = RELIC_POOL.filter(r => !this.activeRelics.some(ar => ar.id === r.id));
        // Fisher-Yates（sort に乱数を渡す方法は偏るため）
        const shuffled = [...available];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled.slice(0, Math.min(count, shuffled.length));
    }

    acquireRelic(relic) {
        // 取得済みのレリックは効果を重ねない
        if (this.activeRelics.some(ar => ar.id === relic.id)) return;
        this.activeRelics.push(relic);
        this.relicState[relic.id] = true;
        window.soundEngine.playUpgrade();

        if (relic.id === 'ink_overdrive') {
            // GameManagerはコンストラクタでGAME_CONFIGの値をコピーして保持しているため、
            // GAME_CONFIG側を書き換えても反映されない。インスタンス側を直接更新する。
            if (window.gameManager) {
                window.gameManager.maxMana += 60;
                window.gameManager.manaRegen *= 1.5;
            }
        } else if (relic.id === 'fortress_repair') {
            this.combatManager.allyBase.maxHp += 200;
            this.combatManager.allyBase.hp += 200;
        }
    }

    render(ctx) {
        if (!this.activeGigaRock) return;
        const rock = this.activeGigaRock;

        ctx.save();
        ctx.translate(rock.x, rock.y);
        ctx.rotate(rock.rotation);

        const grad = ctx.createRadialGradient(
            -rock.radius * 0.35, -rock.radius * 0.35, rock.radius * 0.1,
            0, 0, rock.radius
        );
        grad.addColorStop(0, '#bdc3c7');
        grad.addColorStop(0.6, '#7f8c8d');
        grad.addColorStop(1, '#2c3e50');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, rock.radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#1e272e';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(-rock.radius * 0.6, -rock.radius * 0.2);
        ctx.lineTo(-rock.radius * 0.1, rock.radius * 0.1);
        ctx.lineTo(rock.radius * 0.5, -rock.radius * 0.4);
        ctx.moveTo(-rock.radius * 0.1, rock.radius * 0.1);
        ctx.lineTo(rock.radius * 0.2, rock.radius * 0.6);
        ctx.stroke();

        ctx.restore();
    }
}

window.SkillManager = SkillManager;
