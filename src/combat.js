/**
 * SakamichiTD - Combat & Line Battle Manager (一本道コース対応・安定化設計)
 * コース上の1次元進行距離 s による完全安定ラインバトルロジック
 */
// 攻撃タイマーの消費。0 に戻すと超過分が捨てられ、dt が大きいほど（低FPS・2x/3x速）
// 実効攻撃間隔が延びてしまうため、超過分を持ち越す。剰余を取るので、停止中に溜まった分で連続攻撃はしない。
function consumeAttackTimer(timer, interval) {
    return interval > 0 ? (timer - interval) % interval : 0;
}

class CombatManager {
    constructor() {
        this.allies = [];
        this.enemies = [];
        this.allyBase = null;
        this.enemyBase = null;
        this.effectManager = null;
        this.relicState = {};
        this.coursePath = null;
        this.comboCount = 0;
        this.comboTimer = 0;
        // 味方ループの最中に生まれた子玉（分裂セル）。ループ後にまとめて加える
        this.pendingAllies = [];
    }

    init(allyBase, enemyBase, effectManager, relicState, coursePath) {
        this.allyBase = allyBase;
        this.enemyBase = enemyBase;
        this.effectManager = effectManager;
        this.relicState = relicState;
        this.coursePath = coursePath;
    }

    setCoursePath(coursePath) {
        this.coursePath = coursePath;
    }

    addAlly(ball) {
        this.allies.push(ball);
        window.soundEngine.playSpawn();
    }

    addEnemy(enemy) {
        this.enemies.push(enemy);
    }

    update(dt, isBoosterActive = false) {
        // 前フレームの後半（必殺技など）で倒された敵は、取り除く前に報酬を確定させる
        this.rewardDeadEnemies();
        this.allies = this.allies.filter(a => a.isAlive);
        this.enemies = this.enemies.filter(e => e.isAlive);

        const totalLength = this.coursePath.totalLength;

        // 1. 同種ボール & 同種敵のマージ合体進化（スイカゲーム風）
        // ※「マグネット吸着」レリックは合体判定距離を拡張する形で processMerges に統合済み。
        //   以前は checkMagnetFusion という別系統のマージ処理が並走しており、
        //   スケール上限の不一致(2.8 vs 2.5)や二重マージによるステータス暴走の原因になっていた。
        this.processMerges();

        // 2. 味方ユニットの前進・停止判定 & 前線重なり合い一斉攻撃
        this.allies.sort((a, b) => b.s - a.s);
        this.enemies.sort((a, b) => a.s - b.s);

        for (let i = 0; i < this.allies.length; i++) {
            const ally = this.allies[i];
            let shouldStop = false;

            // このフレームの合体で消えた味方は行動させない
            if (!ally.isAlive) {
                ally.isStopped = false;
                continue;
            }

            // ① 敵拠点到達判定 (s >= totalLength - 20)
            const allyEffRadius = ally.radius * ally.scaleMultiplier;
            if (ally.s + allyEffRadius >= totalLength - 10) {
                ally.s = totalLength - 10 - allyEffRadius;
                shouldStop = true;
                if (ally.attackTimer >= ally.attackInterval) {
                    ally.attackTimer = consumeAttackTimer(ally.attackTimer, ally.attackInterval);
                    if (this.enemyBase.hasBarrier) {
                        this.effectManager.spawnDamageText(this.enemyBase.x, this.enemyBase.y - 25, '🛡️ BARRIER', false, '#00cec9');
                        this.effectManager.spawnImpactSparks(this.enemyBase.x, this.enemyBase.y - 10, 4, '#81ecec');
                        window.soundEngine.playIronImpact();
                    } else {
                        this.enemyBase.takeDamage(ally.atk * ally.scaleMultiplier);
                        this.effectManager.spawnDamageText(this.enemyBase.x, this.enemyBase.y - 20, ally.atk * ally.scaleMultiplier, false, '#e74c3c');
                        window.soundEngine.playPoko();
                    }
                }
            }

            // ② トゲ玉（SPIKE）の周囲スリップ切断（プラズマ・スパイク取得時はピンポン玉にも微細なトゲが付与される）
            const isSpikeCapable = ally.config.id === 'spike' || (ally.config.id === 'pingpong' && this.relicState.sharp_spikes);
            if (isSpikeCapable && ally.spikeTimer >= 0.2) {
                ally.spikeTimer = consumeAttackTimer(ally.spikeTimer, 0.2);
                const baseSpikeDps = ally.config.id === 'spike' ? ally.config.spikeDps : 6;
                for (const e of this.enemies) {
                    if (!e.isAlive) continue;
                    const spikeReach = ally.radius * ally.scaleMultiplier + e.radius * e.scaleMultiplier + 15;
                    if (Math.abs(e.s - ally.s) <= spikeReach) {
                        // トゲ玉はゴーストに特効
                        const ghostBonus = (e.isGhost && ally.config.id === 'spike') ? 1.5 : 1.0;
                        const spikeDmg = (baseSpikeDps * 0.2) * (this.relicState.sharp_spikes ? 2.0 : 1.0) * ghostBonus;
                        e.takeDamage(spikeDmg);
                        this.effectManager.spawnImpactSparks(e.x, e.y, 3, '#e74c3c');
                        window.soundEngine.playSpikeHit();
                    }
                }
            }

            // ③ 敵ユニットとの接触 & 前線重なり合い全員攻撃
            // 狙うのは先頭の「生存している」敵（この周回中に倒された敵を叩き続けないよう毎回探す）。
            // ピンポン玉はゴーストをすり抜けるので、ゴーストを飛ばして後ろの最初の実体敵を狙う
            // （以前は先頭がゴーストだとその後ろの敵軍全体まですり抜けていた）。
            // スーパーボールの場合は後衛のアーチャー（または最奥の敵）を狙う
            // 対象はこの味方より前方（すれ違って後ろへ抜けた敵は除く）の敵に限る。
            // 先頭の敵だけを見ると、その敵とすれ違った後に手前の別の敵を素通りしてしまうため。
            const passesGhost = ally.config.id === 'pingpong';
            const isAhead = (e) => e.s - ally.s >= -(ally.radius * ally.scaleMultiplier + e.radius * e.scaleMultiplier);
            let targetEnemy = this.enemies.find(e => e.isAlive && isAhead(e) && !(passesGhost && e.isGhost)) || null;
            if (ally.config.id === 'super') {
                const aheadEnemies = this.enemies.filter(e => e.isAlive && isAhead(e));
                if (aheadEnemies.length > 1) {
                    const archer = aheadEnemies.find(e => e.isRanged);
                    targetEnemy = archer || aheadEnemies[aheadEnemies.length - 1];
                }
            }

            if (targetEnemy) {
                const distS = targetEnemy.s - ally.s;
                const contactDist = (ally.radius * ally.scaleMultiplier + targetEnemy.radius * targetEnemy.scaleMultiplier);

                // 前線接触距離または前線至近（75px以内）に追いついた味方は全員攻撃に参加！
                if (distS <= contactDist + 75 && distS >= -contactDist) {
                    shouldStop = true;

                    // 初撃（激突ボーナス）
                    if (ally.isFirstHit) {
                        this.triggerFirstHitImpact(ally, targetEnemy, isBoosterActive);
                    }

                    // 【渋滞解消】前線にいる全味方が一斉に攻撃タイマーを回して攻撃！
                    if (ally.attackTimer >= ally.attackInterval) {
                        ally.attackTimer = consumeAttackTimer(ally.attackTimer, ally.attackInterval);
                        // トゲ玉・ボムボールはゴーストに特効
                        const ghostBonus = (targetEnemy.isGhost && (ally.config.id === 'spike' || ally.config.id === 'bomb')) ? 1.5 : 1.0;
                        const dmg = ally.atk * ally.scaleMultiplier * ghostBonus;
                        targetEnemy.takeDamage(dmg);
                        this.effectManager.spawnDamageText(targetEnemy.x, targetEnemy.y, dmg);
                        this.effectManager.spawnImpactSparks(targetEnemy.x, targetEnemy.y, 4);
                        window.soundEngine.playPoko();
                    }
                }
            }

            // ④ 味方同士の隊列（前線への滑り込み重なり合いを大幅に許容）
            // スーパーボールは前線を飛び越えて後衛を狙うので、前の味方に詰まって止まらない
            // （止まると狙う敵に届かないまま攻撃もせず棒立ちになる）
            if (!shouldStop && i > 0 && ally.config.id !== 'super') {
                const aheadAlly = this.allies[i - 1];
                const distS = aheadAlly.s - ally.s;
                // 最小間隔を半径の35%まで詰め込み、団子状に重なることを許可
                const minSpacing = (ally.radius * ally.scaleMultiplier + aheadAlly.radius * aheadAlly.scaleMultiplier) * 0.35;
                if (distS <= minSpacing) {
                    shouldStop = true;
                }
            }

            ally.isStopped = shouldStop;
        }

        // 分裂セルの子玉はループ後に加え、s 順に並べ直してから敵側の判定に進む
        if (this.pendingAllies.length > 0) {
            this.allies.push(...this.pendingAllies);
            this.pendingAllies = [];
            this.allies.sort((a, b) => b.s - a.s);
        }

        // 3. 敵ユニットの停止判定 & 攻撃サイクル（前線重なり合い一斉攻撃）
        for (let j = 0; j < this.enemies.length; j++) {
            const enemy = this.enemies[j];
            let shouldStop = false;

            // この周回中に倒された敵は攻撃・咆哮・押し合いに参加させない
            if (!enemy.isAlive) {
                enemy.isStopped = false;
                continue;
            }

            // この敵の前方（坂の上側）で最も近い生存味方。allies は s の降順なので、
            // すれ違って後ろへ抜けた味方（スーパーボール等）を飛ばした最初の 1 体になる。
            // 倒れた味方を叩き続けないよう毎回探す。
            // ゴーストとピンポン玉は互いにすり抜ける（味方側でピンポン玉がゴーストを無視するのと対にする）
            const leadingAlly = this.allies.find(a =>
                a.isAlive &&
                !(enemy.isGhost && a.config.id === 'pingpong') &&
                enemy.s - a.s >= -(a.radius * a.scaleMultiplier + enemy.radius * enemy.scaleMultiplier)
            ) || null;

            // ① 自陣ゲート到達判定 (s <= 15)
            const enemyEffRadius = enemy.radius * enemy.scaleMultiplier;
            if (enemy.s - enemyEffRadius <= 15) {
                enemy.s = 15 + enemyEffRadius;
                shouldStop = true;
                if (enemy.attackTimer >= enemy.attackInterval) {
                    enemy.attackTimer = consumeAttackTimer(enemy.attackTimer, enemy.attackInterval);
                    this.allyBase.takeDamage(enemy.atk);
                    this.effectManager.spawnDamageText(this.allyBase.x, this.allyBase.y + 15, enemy.atk, false, '#3498db');
                    this.effectManager.triggerShake(5, 0.15);
                    window.soundEngine.playPoko();
                }
            }

            // ② 味方ボールとの交戦判定
            if (leadingAlly) {
                const distS = enemy.s - leadingAlly.s;
                const contactDist = (leadingAlly.radius * leadingAlly.scaleMultiplier + enemy.radius * enemy.scaleMultiplier);

                // スケルトン・アーチャー（遠距離射撃手）
                if (enemy.isRanged) {
                    if (distS <= enemy.attackRange) {
                        shouldStop = true;
                        if (enemy.attackTimer >= enemy.attackInterval) {
                            enemy.attackTimer = consumeAttackTimer(enemy.attackTimer, enemy.attackInterval);
                            leadingAlly.takeDamage(enemy.atk);
                            this.effectManager.spawnDamageText(leadingAlly.x, leadingAlly.y, enemy.atk, false, '#ecf0f1');
                            this.effectManager.spawnImpactSparks(leadingAlly.x, leadingAlly.y, 4, '#bdc3c7');
                            window.soundEngine.playPoko();
                        }
                    }
                } else if (distS <= contactDist + 65 && distS >= -contactDist) {
                    // 近接接触（前線付近の全敵が一斉攻撃）
                    shouldStop = true;

                    // 酸液自爆スライムの即時接触自爆！
                    if (enemy.isAcidSuicide) {
                        this.triggerAcidExplosion(enemy);
                        continue;
                    }

                    if (enemy.attackTimer >= enemy.attackInterval) {
                        enemy.attackTimer = consumeAttackTimer(enemy.attackTimer, enemy.attackInterval);

                        if (enemy.isTornado) {
                            // 【新機能】トルネード・ゴーレムの突風吹き飛ばし攻撃！
                            this.effectManager.spawnWindBlast(enemy.x, enemy.y);
                            window.soundEngine.playCycloneWind();
                            this.effectManager.triggerShake(6, 0.2);

                            const repelLimit = enemy.radius * enemy.scaleMultiplier + 60;
                            for (const ally of this.allies) {
                                if (ally.isAlive && Math.abs(ally.s - enemy.s) <= repelLimit) {
                                    ally.takeDamage(enemy.atk);
                                    if (ally.config.immuneKnockback) {
                                        this.effectManager.spawnDamageText(ally.x, ally.y, 'GUARD!', false, '#7f8c8d');
                                        this.effectManager.spawnImpactSparks(ally.x, ally.y, 4, '#bdc3c7');
                                    } else {
                                        // 坂の上方向へ豪快に吹き飛ばす！
                                        ally.applyKnockback(-enemy.repelForce);
                                        this.effectManager.spawnDamageText(ally.x, ally.y, 'BLOW AWAY!', true, '#00cec9');
                                        this.effectManager.spawnImpactSparks(ally.x, ally.y, 6, '#81ecec');
                                    }
                                }
                            }
                        } else if (enemy.isAreaAttack) {
                            // ブルドーザー・ボスの前方範囲なぎ払い攻撃！（密集したボールを一網打尽）
                            const areaLimit = enemy.radius * enemy.scaleMultiplier + (enemy.config.areaRadius || 45);
                            let hitCount = 0;
                            for (const ally of this.allies) {
                                if (ally.isAlive && Math.abs(ally.s - enemy.s) <= areaLimit) {
                                    ally.takeDamage(enemy.atk);
                                    this.effectManager.spawnDamageText(ally.x, ally.y, enemy.atk, true, '#e74c3c');
                                    this.effectManager.spawnImpactSparks(ally.x, ally.y, 5, '#e74c3c');
                                    if (!ally.config.immuneKnockback) {
                                        ally.applyKnockback(-14);
                                    }
                                    hitCount++;
                                }
                            }
                            this.effectManager.triggerShake(enemy.isTitan ? 10 : 6, 0.18);
                            window.soundEngine.playIronImpact();
                        } else {
                            leadingAlly.takeDamage(enemy.atk);
                            this.effectManager.spawnDamageText(leadingAlly.x, leadingAlly.y, enemy.atk, false, '#f39c12');
                            this.effectManager.spawnImpactSparks(leadingAlly.x, leadingAlly.y, 4, '#e67e22');
                            window.soundEngine.playPoko();

                            if (!leadingAlly.config.immuneKnockback) {
                                leadingAlly.applyKnockback(-12);
                            }
                        }
                    }
                }
            }

            // タイタンボスの咆哮衝撃波（定期的に全前線を押し流す！予備動作を挟んで回避のチャンスを与える）
            if (enemy.isTitan && enemy.roarInterval > 0) {
                enemy.roarTimer += dt;
                if (!enemy.roarTelegraphed && enemy.roarTimer >= enemy.roarInterval - 1.0) {
                    enemy.roarTelegraphed = true;
                    this.effectManager.spawnDamageText(enemy.x, enemy.y - 60, '⚠️ 咆哮の予備動作...', true, '#f1c40f');
                }
                if (enemy.roarTimer >= enemy.roarInterval) {
                    enemy.roarTimer = 0;
                    enemy.roarTelegraphed = false;
                    this.effectManager.triggerShake(16, 0.45);
                    this.effectManager.spawnWindBlast(enemy.x, enemy.y);
                    this.effectManager.spawnDamageText(enemy.x, enemy.y - 45, '💥 咆哮衝破!!', true, '#e74c3c');
                    window.soundEngine.playCycloneWind();
                    window.soundEngine.playGotsun(2.2);

                    const blastRange = enemy.radius + 120;
                    for (const ally of this.allies) {
                        if (ally.isAlive && Math.abs(ally.s - enemy.s) <= blastRange) {
                            if (ally.config.immuneKnockback) {
                                this.effectManager.spawnDamageText(ally.x, ally.y, 'GUARD!', false, '#7f8c8d');
                            } else {
                                ally.applyKnockback(-150);
                                this.effectManager.spawnDamageText(ally.x, ally.y, 'BLOWN!', true, '#e74c3c');
                            }
                        }
                    }
                }
            }

            // ③ 敵同士の重なり合い
            if (!shouldStop && j > 0) {
                const aheadEnemy = this.enemies[j - 1];
                const distS = enemy.s - aheadEnemy.s;
                const minSpacing = (enemy.radius * enemy.scaleMultiplier + aheadEnemy.radius * aheadEnemy.scaleMultiplier) * 0.35;
                if (distS <= minSpacing) {
                    shouldStop = true;
                }
            }

            enemy.isStopped = shouldStop;
        }

        // 4. 数の押し合い判定（前線ズリズリ移動）
        this.processPushBattle(dt);

        // 5. 各ユニットの移動更新
        for (const ally of this.allies) {
            ally.update(dt, this.effectManager, isBoosterActive);
        }
        for (const enemy of this.enemies) {
            enemy.update(dt);
        }

        // 6. 死亡ユニットの処理（格に応じて撃破演出をスケール＆連続撃破コンボを表示）
        if (this.comboTimer > 0) {
            this.comboTimer -= dt;
        } else {
            this.comboCount = 0;
        }
        this.rewardDeadEnemies();
        for (const ally of this.allies) {
            if (!ally.isAlive && !ally.effectTriggered) {
                ally.effectTriggered = true;
                this.effectManager.spawnImpactSparks(ally.x, ally.y, 8, '#747d8c');
            }
        }
    }

    // 倒れた敵の報酬（マナ・撃破数・コンボ）を 1 体につき 1 回だけ与える
    rewardDeadEnemies() {
        for (const enemy of this.enemies) {
            if (!enemy.isAlive && !enemy.rewardGiven) {
                enemy.rewardGiven = true;
                if (window.gameManager) {
                    window.gameManager.addMana(enemy.manaReward);
                    window.gameManager.registerKill(enemy);
                }

                const tier = enemy.isTitan ? 3 : (enemy.isBoss ? 2 : (enemy.mergeLevel >= 2 ? 1 : 0));
                this.effectManager.spawnDamageText(enemy.x, enemy.y, `+${enemy.manaReward} MP`, false, '#00d2d3');
                this.effectManager.spawnImpactSparks(enemy.x, enemy.y, 14 + tier * 10, '#2ecc71');
                this.effectManager.triggerShake(4 + tier * 3, 0.1 + tier * 0.05);

                this.comboCount++;
                this.comboTimer = 0.6;
                if (this.comboCount >= 3) {
                    this.effectManager.spawnDamageText(enemy.x, enemy.y - 30, `🔥 ${this.comboCount} COMBO!`, true, '#feca57');
                }
            }
        }
    }

    // 酸液自爆スライムの爆発
    // 仕様: 自爆は「味方ボールに接触したとき」だけ起きる。接触前に倒せば自爆させずに処理できる
    // （README の「遠距離からボムボールで先制爆破」）。倒されたときの死に際の自爆は無い。
    // 自爆はプレイヤーが倒したわけではないので、撃破報酬（マナ・スコア・コンボ）は与えない。
    triggerAcidExplosion(slime) {
        slime.isAlive = false;
        slime.rewardGiven = true;
        const blastRadius = slime.config.suicideRadius || 75;
        this.effectManager.spawnExplosion(slime.x, slime.y, blastRadius);
        window.soundEngine.playExplosion();

        // 範囲内の全味方ボールに特大酸ダメージ（ピンポン玉は瞬時に消滅）
        for (const ally of this.allies) {
            const dist = Math.hypot(ally.x - slime.x, ally.y - slime.y);
            if (dist <= blastRadius) {
                ally.takeDamage(slime.atk);
                this.effectManager.spawnDamageText(ally.x, ally.y, slime.atk, true, '#6c5ce7');
                this.effectManager.spawnImpactSparks(ally.x, ally.y, 6, '#a29bfe');
            }
        }
    }

    // 初撃激突ボーナス
    triggerFirstHitImpact(ally, enemy, isBoosterActive) {
        ally.isFirstHit = false;

        // ボムボールの自爆
        if (ally.config.isBomb) {
            this.triggerBombExplosion(ally);
            return;
        }

        let critMultiplier = 2.0;
        if (isBoosterActive) critMultiplier *= 3.0;
        if (this.relicState.heavy_impact) critMultiplier *= 1.75;
        // トゲ玉・ボムボールはゴーストに特効
        if (enemy.isGhost && (ally.config.id === 'spike' || ally.config.id === 'bomb')) critMultiplier *= 1.5;

        let initialDamage = ally.atk * ally.scaleMultiplier * critMultiplier;

        // シールドガードによる初撃軽減
        if (enemy.shieldGuard) {
            initialDamage *= enemy.shieldGuard;
        }

        enemy.takeDamage(initialDamage);

        // ゴツン演出
        const shakeMag = ally.config.id === 'iron' ? 9 : 5;
        this.effectManager.triggerShake(shakeMag, 0.18);
        this.effectManager.triggerHitStop(0.05);

        if (ally.config.id === 'iron') {
            window.soundEngine.playIronImpact();
        } else if (ally.config.id === 'pingpong') {
            window.soundEngine.playGotsun(0.7);
            window.soundEngine.playPingPong();
        } else {
            window.soundEngine.playGotsun(1.2);
        }

        this.effectManager.spawnDamageText(enemy.x, enemy.y, initialDamage, true);
        this.effectManager.spawnImpactSparks(enemy.x, enemy.y, 12, '#ffeaa7');

        // ノックバック計算: ピンポン玉は軽量(0.35)で敵をハメられない。敵がノックバック無効なら完全に0！
        let kbFactor = ally.config.knockbackFactor !== undefined ? ally.config.knockbackFactor : 1.0;
        let knockbackPower = GAME_CONFIG.KNOCKBACK_DISTANCE * kbFactor;
        if (this.relicState.heavy_impact) knockbackPower *= 2.0;

        // ブルドーザー・シールド兵・ボス・ゴーストは完全ノックバック無効！
        if (enemy.immuneKnockback) {
            knockbackPower = 0;
        }

        if (knockbackPower > 0) {
            enemy.applyKnockback(knockbackPower);
        }

        // レリック: 分裂セル
        if (this.relicState.split_cell && !ally.isSplitChild) {
            this.triggerSplitCell(ally);
        }
    }

    // ボムボール爆発
    triggerBombExplosion(bomb) {
        bomb.isAlive = false;
        // マージで拡張された爆発範囲はボール個体が持つ（共有設定 BALL_TYPES は書き換えない）
        const blastRadius = bomb.explosionRadius || bomb.config.explosionRadius;
        this.effectManager.spawnExplosion(bomb.x, bomb.y, blastRadius);
        window.soundEngine.playExplosion();

        for (const enemy of this.enemies) {
            if (!enemy.isAlive) continue;
            const dist = Math.hypot(enemy.x - bomb.x, enemy.y - bomb.y);
            if (dist <= blastRadius) {
                const dmg = bomb.atk * (1 - dist / (blastRadius * 1.3));
                enemy.takeDamage(dmg);
                enemy.applyKnockback(60);
                this.effectManager.spawnDamageText(enemy.x, enemy.y, dmg, true, '#e74c3c');
            }
        }
    }

    // 分裂セル
    triggerSplitCell(parentBall) {
        for (let offset of [-20, 20]) {
            // 味方ボールの上限を超えて子玉を増やさない
            if (this.allies.length + this.pendingAllies.length >= GAME_CONFIG.MAX_ALLIES) break;
            const mini = new Ball(
                Math.max(0, Math.min(this.coursePath.totalLength, parentBall.s + offset)),
                'PINGPONG',
                this.coursePath,
                this.relicState
            );
            // scaleMultiplier は recomputeDerivedStats() で再計算されるため、元になる mergeScale 側で縮める
            mini.mergeScale = 0.75;
            mini.recomputeDerivedStats();
            mini.isSplitChild = true;
            mini.isFirstHit = true;
            this.pendingAllies.push(mini);
        }
        window.soundEngine.playPingPong();
    }

    // 同種ボール & 同種敵のマージ合体進化処理（スイカゲーム風）
    processMerges() {
        // ① 味方ボール同士のマージ
        for (let i = 0; i < this.allies.length; i++) {
            const a1 = this.allies[i];
            if (!a1.isAlive || a1.mergeLevel >= 3) continue;

            for (let j = i + 1; j < this.allies.length; j++) {
                const a2 = this.allies[j];
                if (!a2.isAlive || a2.mergeLevel >= 3 || a1.typeKey !== a2.typeKey || a1.mergeLevel !== a2.mergeLevel) continue;

                const distS = Math.abs(a1.s - a2.s);
                // 距離が近接したら合体！（マグネット吸着レリックで合体判定距離が拡張される）
                const mergeReach = this.relicState.magnet_fusion ? 60 : 24;
                if (distS <= mergeReach) {
                    a2.isAlive = false;
                    a2.effectTriggered = true; // 合体で消えた側に「撃破」の火花を出さない
                    const success = a1.applyMerge(a2);
                    if (success) {
                        window.soundEngine.playMergeSound(a1.mergeLevel);
                        const sparkColor = a1.mergeLevel === 2 ? '#00d2d3' : '#f1c40f';
                        this.effectManager.spawnImpactSparks(a1.x, a1.y, 16, sparkColor);
                        const label = a1.mergeLevel === 2 ? '★Lv.2 合体!!' : '★★MAX 巨大合体!!';
                        this.effectManager.spawnDamageText(a1.x, a1.y, label, true, sparkColor);
                        this.effectManager.triggerShake(5, 0.12);

                        // レリック: 共鳴コア（合体の度にマナ回復＆周囲の攻撃タイマーを加速）
                        if (this.relicState.resonance_core) {
                            if (window.gameManager) window.gameManager.addMana(15);
                            for (const other of this.allies) {
                                if (other !== a1 && other.isAlive && Math.abs(other.s - a1.s) < 80) {
                                    other.attackTimer = Math.min(other.attackInterval, other.attackTimer + other.attackInterval * 0.3);
                                }
                            }
                        }
                    }
                    break;
                }
            }
        }

        // ② 敵同士のマージ
        for (let i = 0; i < this.enemies.length; i++) {
            const e1 = this.enemies[i];
            if (!e1.isAlive || e1.mergeLevel >= 2 || e1.isBoss) continue;

            for (let j = i + 1; j < this.enemies.length; j++) {
                const e2 = this.enemies[j];
                if (!e2.isAlive || e2.mergeLevel >= 2 || e2.isBoss || e1.typeKey !== e2.typeKey) continue;

                const distS = Math.abs(e1.s - e2.s);
                if (distS <= 22) {
                    e2.isAlive = false;
                    e2.rewardGiven = true; // 合体で消えた側は撃破扱いにしない（報酬は合体後の manaReward 2.2倍に含まれる）
                    const success = e1.applyMerge(e2);
                    if (success) {
                        window.soundEngine.playMergeSound(2);
                        this.effectManager.spawnImpactSparks(e1.x, e1.y, 14, '#e74c3c');
                        this.effectManager.spawnDamageText(e1.x, e1.y, '★ELITE 合体!!', true, '#e74c3c');
                        this.effectManager.triggerShake(4, 0.1);
                    }
                    break;
                }
            }
        }
    }

    // 押し合い判定（前線ズリズリ移動）
    processPushBattle(dt) {
        let allyPushPower = 0;
        let enemyPushPower = 0;

        for (const ally of this.allies) {
            if (ally.isAlive && ally.isStopped) allyPushPower += ally.pushPower;
        }
        for (const enemy of this.enemies) {
            if (enemy.isAlive && enemy.isStopped) enemyPushPower += enemy.pushPower;
        }

        // 【バグ修正】双方が前線で接触して押し合っている時のみ前線が移動する
        // どちらか一方が 0 の場合は押し合い前線移動は絶対に発生させない
        if (allyPushPower === 0 || enemyPushPower === 0) return;

        const powerDiff = allyPushPower - enemyPushPower;
        // 【バグ修正】急激なワープ・超猛スピード加速を防止するため、押し合い速度を上限でクランプ
        const rawSpeed = powerDiff * GAME_CONFIG.PUSH_SPEED_FACTOR;
        const cap = GAME_CONFIG.PUSH_SPEED_CAP;
        const clampedSpeed = Math.max(-cap, Math.min(cap, rawSpeed));
        const pushDelta = clampedSpeed * dt;

        if (Math.abs(pushDelta) > 0.001) {
            for (const enemy of this.enemies) {
                if (enemy.isStopped) {
                    enemy.s = Math.max(0, Math.min(this.coursePath.totalLength, enemy.s + pushDelta));
                    enemy.updateCoordinates();
                }
            }
            for (const ally of this.allies) {
                if (ally.isStopped) {
                    ally.s = Math.max(0, Math.min(this.coursePath.totalLength, ally.s + pushDelta));
                    ally.updateCoordinates();
                }
            }
        }
    }

    // ボス襲来時の味方全消しディスペル
    clearAllAllies() {
        for (const ally of this.allies) {
            ally.isAlive = false;
            this.effectManager.spawnImpactSparks(ally.x, ally.y, 14, '#00d2d3');
            this.effectManager.spawnDamageText(ally.x, ally.y, '消滅!!', true, '#e74c3c');
        }
        this.allies = [];
        this.pendingAllies = [];
    }

    render(ctx) {
        for (const enemy of this.enemies) {
            enemy.render(ctx);
        }
        for (const ally of this.allies) {
            ally.render(ctx);
        }
    }
}

window.CombatManager = CombatManager;
