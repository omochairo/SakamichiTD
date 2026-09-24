/**
 * SakamichiTD - Main Game Controller (手描きスケッチ準拠 ジグザグ板スロープ版)
 */
class GameManager {
    constructor() {
        this.canvas = null;
        this.ctx = null;

        this.mana = 60;
        this.maxMana = GAME_CONFIG.MANA_MAX;
        this.manaRegen = GAME_CONFIG.MANA_REGEN_BASE;

        this.stage = 1;
        this.wave = 1;
        this.maxWave = 4;
        this.waveTimer = 0;
        this.enemySpawnTimer = 0;
        this.waveActive = false;
        this.isPaused = false;
        this.gameSpeed = 1.0;
        this.isGameOver = false;
        this.isVictory = false;

        this.infiniteMana = false;

        this.ballCooldowns = {
            pingpong: 0,
            iron: 0,
            spike: 0,
            super: 0,
            bomb: 0
        };

        this.relicState = {};
        this.lastTime = 0;

        // ボス＆Wave進行管理
        this.bossSpawned = false;
        this.titanBoss = null;
        this.enemiesSpawnedInWave = 0;
        this.waveTotalEnemies = 10;
        this.wave3MidBossSpawned = false;

        // レリック3択モーダルの多重起動ガード
        this.relicModalOpen = false;

        // 強くてニューゲーム（周回）＆ スコア
        this.loopCount = 0;
        this.score = 0;
        this.bestScore = Number(localStorage.getItem('sakamichiTD_bestScore') || 0);
    }

    addScore(amount) {
        this.score += Math.round(amount);
    }

    saveBestScoreIfNeeded() {
        if (this.score > this.bestScore) {
            this.bestScore = this.score;
            localStorage.setItem('sakamichiTD_bestScore', String(this.bestScore));
        }
    }

    finalizeVictory() {
        this.isVictory = true;
        window.soundEngine.playVictory();
        this.saveBestScoreIfNeeded();
        const scoreEl = document.getElementById('victoryScoreText');
        if (scoreEl) scoreEl.textContent = `スコア: ${this.score}（ベスト: ${this.bestScore}）`;
        const loopBtn = document.getElementById('btn-loop-continue');
        if (loopBtn) loopBtn.textContent = `🔁 強くてニューゲーム (${this.loopCount + 2}周目へ)`;
        document.getElementById('victoryModal')?.classList.remove('hidden');
    }

    finalizeDefeat() {
        this.isGameOver = true;
        window.soundEngine.playDefeat();
        this.saveBestScoreIfNeeded();
        const scoreEl = document.getElementById('defeatScoreText');
        if (scoreEl) scoreEl.textContent = `スコア: ${this.score}（ベスト: ${this.bestScore}）`;
        document.getElementById('defeatModal')?.classList.remove('hidden');
    }

    // 強くてニューゲーム：レリックとスコアを引き継いだまま、敵を強化してWave1から周回する
    startNewGamePlus() {
        this.loopCount++;
        this.isVictory = false;
        this.isGameOver = false;
        this.relicModalOpen = false;
        document.getElementById('victoryModal')?.classList.add('hidden');

        if (this.stage !== 2) this.toggleStage();

        this.allyBase.hp = this.allyBase.maxHp;
        this.enemyBase.hasBarrier = true;
        this.enemyBase.hp = this.enemyBase.maxHp;

        this.combatManager.clearAllAllies();
        this.combatManager.enemies = [];
        this.bossSpawned = false;
        this.titanBoss = null;

        this.startWave(1);
    }

    // 敵ステータスに周回インフレ倍率を適用（強くてニューゲーム用）
    applyLoopScaling(enemy) {
        if (this.loopCount <= 0) return;
        const mult = 1 + this.loopCount * 0.35;
        enemy.maxHp = Math.round(enemy.maxHp * mult);
        enemy.hp = enemy.maxHp;
        enemy.atk = Math.round(enemy.atk * mult);
        enemy.manaReward = Math.round(enemy.manaReward * (1 + this.loopCount * 0.5));
    }

    init() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');

        // Stage 1 (手描きスケッチの3段ジグザグスロープ)
        this.coursePath = createStage1Path();

        this.effectManager = new EffectManager();
        this.combatManager = new CombatManager();
        this.skillManager = new SkillManager();

        this.allyBase = new BaseBuilding(this.coursePath.allyGate, 600, true);
        this.enemyBase = new BaseBuilding(this.coursePath.enemyBase, 1500, false);

        this.combatManager.init(this.allyBase, this.enemyBase, this.effectManager, this.relicState, this.coursePath);
        this.skillManager.init(this.combatManager, this.effectManager, this.relicState, this.coursePath);

        this.bindEvents();
        this.startWave(1);

        this.lastTime = performance.now();
        requestAnimationFrame(this.loop.bind(this));
    }

    bindEvents() {
        const unlockAudio = () => {
            window.soundEngine.init();
            window.removeEventListener('click', unlockAudio);
            window.removeEventListener('keydown', unlockAudio);
        };
        window.addEventListener('click', unlockAudio);
        window.addEventListener('keydown', unlockAudio);

        // ボール召喚ボタン
        document.querySelectorAll('.ball-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const type = btn.dataset.type;
                this.spawnBall(type);
            });
        });

        // 必殺技ボタン
        document.querySelectorAll('.skill-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const skillId = btn.dataset.skill;
                this.skillManager.triggerSkill(skillId);
            });
        });

        // デバッグツールボタン
        document.getElementById('btn-mana')?.addEventListener('click', () => {
            this.infiniteMana = !this.infiniteMana;
            if (this.infiniteMana) this.mana = this.maxMana;
            this.updateDebugUI();
        });

        document.getElementById('btn-speed')?.addEventListener('click', () => {
            if (this.gameSpeed === 1.0) this.gameSpeed = 2.0;
            else if (this.gameSpeed === 2.0) this.gameSpeed = 3.0;
            else this.gameSpeed = 1.0;
            this.updateDebugUI();
        });

        document.getElementById('btn-relic-select')?.addEventListener('click', () => {
            this.openRelicModal();
        });

        document.getElementById('btn-reset-skills')?.addEventListener('click', () => {
            for (const k in this.skillManager.cooldowns) {
                this.skillManager.cooldowns[k] = 0;
            }
        });

        // ステージ切り替えボタン (Stage 1 / Stage 2)
        document.getElementById('btn-toggle-stage')?.addEventListener('click', () => {
            this.toggleStage();
        });

        // ボスWaveへ即時スキップボタン
        document.getElementById('btn-skip-boss')?.addEventListener('click', () => {
            if (this.isGameOver || this.isVictory) return;
            this.startWave(4);
        });

        // キーボードショートカット
        window.addEventListener('keydown', (e) => {
            if (e.key === '1') this.spawnBall('pingpong');
            else if (e.key === '2') this.spawnBall('iron');
            else if (e.key === '3') this.spawnBall('spike');
            else if (e.key === '4') this.spawnBall('super');
            else if (e.key === '5') this.spawnBall('bomb');
            else if (e.key.toLowerCase() === 'q') this.skillManager.triggerSkill('giga_rock');
            else if (e.key.toLowerCase() === 'w') this.skillManager.triggerSkill('booster_slope');
            else if (e.key.toLowerCase() === 'e') this.skillManager.triggerSkill('pinball_fever');
            else if (e.key.toLowerCase() === 'm') {
                this.infiniteMana = !this.infiniteMana;
                if (this.infiniteMana) this.mana = this.maxMana;
                this.updateDebugUI();
            } else if (e.key.toLowerCase() === 'r') {
                this.openRelicModal();
            } else if (e.key.toLowerCase() === 'c') {
                for (const k in this.skillManager.cooldowns) this.skillManager.cooldowns[k] = 0;
            } else if (e.key.toLowerCase() === 't') {
                this.toggleStage();
            } else if (e.key.toLowerCase() === 'b') {
                if (!this.isGameOver && !this.isVictory) this.startWave(4);
            } else if (e.code === 'Space') {
                this.isPaused = !this.isPaused;
            }
        });

        // リトライボタン
        document.getElementById('btn-retry')?.addEventListener('click', () => location.reload());
        document.getElementById('btn-retry-win')?.addEventListener('click', () => location.reload());

        // 強くてニューゲーム（周回）ボタン
        document.getElementById('btn-loop-continue')?.addEventListener('click', () => {
            this.startNewGamePlus();
        });
    }

    toggleStage() {
        const oldTotalLength = this.coursePath.totalLength;
        this.stage = this.stage === 1 ? 2 : 1;
        this.coursePath = this.stage === 1 ? createStage1Path() : createStage2Path();
        const newTotalLength = this.coursePath.totalLength;
        const ratio = oldTotalLength > 0 ? newTotalLength / oldTotalLength : 1;

        this.allyBase.x = this.coursePath.allyGate.x;
        this.allyBase.y = this.coursePath.allyGate.y;

        this.enemyBase.x = this.coursePath.enemyBase.x;
        this.enemyBase.y = this.coursePath.enemyBase.y;

        this.combatManager.setCoursePath(this.coursePath);
        this.skillManager.setCoursePath(this.coursePath);

        // 既存ユニットの位置補正（コース総延長比でsを再スケールしてから再投影する）
        this.combatManager.allies.forEach(a => {
            a.coursePath = this.coursePath;
            a.s *= ratio;
            a.updateCoordinates();
        });
        this.combatManager.enemies.forEach(e => {
            e.coursePath = this.coursePath;
            e.s *= ratio;
            e.updateCoordinates();
        });

        const stageBtn = document.getElementById('btn-toggle-stage');
        if (stageBtn) stageBtn.textContent = `Stage: ${this.stage}`;

        document.getElementById('stageDisplay').textContent = `Stage ${this.stage} - ${this.stage === 1 ? 'クラシックスロープ' : 'ロングスロープ'}`;
    }

    updateDebugUI() {
        const manaBtn = document.getElementById('btn-mana');
        if (manaBtn) {
            manaBtn.textContent = this.infiniteMana ? '無限マナ: ON' : '無限マナ: OFF';
            manaBtn.classList.toggle('active', this.infiniteMana);
        }
        const speedBtn = document.getElementById('btn-speed');
        if (speedBtn) {
            speedBtn.textContent = `速度: ${this.gameSpeed}x`;
        }
    }

    addMana(amount) {
        this.mana = Math.min(this.maxMana, this.mana + amount);
    }

    // 右上自陣ゲート（s=0）からボールを出撃
    spawnBall(typeKey) {
        if (this.isGameOver || this.isVictory) return;
        const config = BALL_TYPES[typeKey.toUpperCase()];
        if (!config) return;

        if (this.ballCooldowns[typeKey] > 0) return;
        if (!this.infiniteMana && this.mana < config.cost) return;

        if (!this.infiniteMana) {
            this.mana -= config.cost;
        }
        this.ballCooldowns[typeKey] = config.cooldown;

        // コース開始点 s=0
        const ball = new Ball(0, typeKey.toUpperCase(), this.coursePath, this.relicState);
        this.combatManager.addAlly(ball);
    }

    startWave(waveNum) {
        this.wave = waveNum;
        this.waveActive = true;
        this.waveTimer = 0;
        this.enemySpawnTimer = 0;
        this.enemiesSpawnedInWave = 0;
        this.bossDefeatedTriggered = false;
        this.wave3MidBossSpawned = false;

        // Waveごとの敵部隊総数設定
        if (this.wave === 1) this.waveTotalEnemies = 10;
        else if (this.wave === 2) this.waveTotalEnemies = 12;
        else if (this.wave === 3) this.waveTotalEnemies = 14;
        else this.waveTotalEnemies = 16;

        // 敵要塞のフォースバリア展開（Wave 1〜3での早期破壊クリアを完全防止）
        this.enemyBase.hasBarrier = true;

        if (this.wave === 4) {
            document.getElementById('waveDisplay').textContent = 'Wave 4 - ⚠️ 最終決戦 ⚠️';

            // 【新仕様】ボスWave突入演出：味方ボール全消し ＆ マナ急速チャージ ＆ 巨大ボス降臨
            this.bossSpawned = true;
            this.combatManager.clearAllAllies();
            this.mana = this.maxMana; // マナ緊急全快チャージ！

            this.effectManager.triggerWarning('⚠️ WARNING! 超巨神タイタン襲来 ⚠️', 4.0);
            window.soundEngine.playWarningSiren();

            // 超巨神タイタンボスを左下要塞から出撃！
            const titan = new Enemy(this.coursePath.totalLength, 'TITAN_GOLEM', this.coursePath);
            this.applyLoopScaling(titan);
            this.combatManager.addEnemy(titan);
            this.titanBoss = titan;
            this.enemiesSpawnedInWave++;
        } else {
            document.getElementById('waveDisplay').textContent = `Wave ${this.wave} / ${this.maxWave}`;
        }
    }

    updateWaveSpawner(dt) {
        if (!this.waveActive || this.isGameOver || this.isVictory) return;

        this.waveTimer += dt;
        this.enemySpawnTimer += dt;

        // スポーン間隔（3体まとめて出た後に一息つく緩急のあるテンポ）
        let spawnInterval = Math.max(1.6, 3.8 - this.wave * 0.4);
        if (this.enemiesSpawnedInWave % 4 === 3) spawnInterval *= 1.8;

        if (this.enemiesSpawnedInWave < this.waveTotalEnemies && this.enemySpawnTimer >= spawnInterval) {
            this.enemySpawnTimer = 0;
            this.spawnEnemyForCurrentWave();
            this.enemiesSpawnedInWave++;
        }

        // Waveクリア判定
        if (this.wave < this.maxWave) {
            // 通常Wave (1〜3): 設定された敵部隊をすべて倒したらクリア！
            if (this.enemiesSpawnedInWave >= this.waveTotalEnemies && this.combatManager.enemies.length === 0) {
                this.onWaveClear();
            }
        } else {
            // Wave 4 (ボスWave):
            // ① タイタンボスが倒された瞬間の戦況演出
            if (this.titanBoss && !this.titanBoss.isAlive && !this.bossDefeatedTriggered) {
                this.bossDefeatedTriggered = true;
                this.effectManager.triggerBossDefeated('👑 BOSS DEFEATED! 残敵を殲滅せよ！', 3.5);
                this.effectManager.spawnExplosion(this.titanBoss.x, this.titanBoss.y, 110);
                window.soundEngine.playExplosion();
                this.addScore(1000);
                // ボス撃破後は護衛の追加湧きを打ち止めにし、残存部隊の掃討に集中させる
                this.enemiesSpawnedInWave = this.waveTotalEnemies;
            }

            // ② 【完全制圧の厳格判定】タイタンボスを撃破し、かつ、すべての残存敵部隊が全滅したときに初めて完全勝利！
            if (this.bossSpawned && this.titanBoss && !this.titanBoss.isAlive && this.combatManager.enemies.length === 0 && !this.isVictory) {
                this.enemyBase.hasBarrier = false;
                this.enemyBase.hp = 0;
                this.effectManager.spawnExplosion(this.enemyBase.x, this.enemyBase.y, 120);
                this.finalizeVictory();
            }
        }
    }

    // 左下敵要塞（s = totalLength）から敵を出撃
    spawnEnemyForCurrentWave() {
        let enemyKey = 'GOBLIN';

        if (this.wave === 1) {
            // Wave 1: ゴブリン歩兵 ＋ 酸液自爆スライム（ピンポン単騎だと自爆で溶かされる）
            // 終盤（9体目）にトルネード・ゴーレムを1体だけ混ぜ、Wave2の"予告編"にする
            if (this.enemiesSpawnedInWave === 8) {
                enemyKey = 'TORNADO_GOLEM';
            } else {
                enemyKey = Math.random() < 0.65 ? 'GOBLIN' : 'ACID_SLIME';
            }
        } else if (this.wave === 2) {
            // Wave 2: トルネード・ゴーレム（吹き飛ばし突風）＋ 重装シールド兵 ＋ アーチャー ＋ ゴブリン
            const r = Math.random();
            if (r < 0.30) enemyKey = 'TORNADO_GOLEM';
            else if (r < 0.60) enemyKey = 'SHIELD';
            else if (r < 0.85) enemyKey = 'ARCHER';
            else enemyKey = 'GOBLIN';
        } else if (this.wave === 3) {
            // Wave 3: トルネード・ゴーレム ＋ 重装ブルドーザー ＋ シャドウ・ゴースト ＋ スピードウルフ
            // 終盤（10体目）に死蔵されていたアイアンゴーレムを中ボスとして1体だけ投入し、Wave4への踏み台にする
            if (this.enemiesSpawnedInWave === 9 && !this.wave3MidBossSpawned) {
                this.wave3MidBossSpawned = true;
                enemyKey = 'GOLEM_BOSS';
                this.effectManager.spawnDamageText(this.enemyBase.x, this.enemyBase.y - 40, '⚔️ 中ボス出現！', true, '#f39c12');
            } else {
                const r = Math.random();
                if (r < 0.30) enemyKey = 'TORNADO_GOLEM';
                else if (r < 0.55) enemyKey = 'BULLDOZER';
                else if (r < 0.75) enemyKey = 'GHOST';
                else if (r < 0.90) enemyKey = 'WOLF';
                else enemyKey = 'ARCHER';
            }
        } else if (this.wave >= 4) {
            // Wave 4: タイタンボスの親衛隊部隊（トルネード ＋ ブルドーザー ＋ アーチャー ＋ 酸スライム）
            const r = Math.random();
            if (r < 0.35) enemyKey = 'TORNADO_GOLEM';
            else if (r < 0.65) enemyKey = 'BULLDOZER';
            else if (r < 0.85) enemyKey = 'ARCHER';
            else enemyKey = 'ACID_SLIME';
        }

        const enemy = new Enemy(this.coursePath.totalLength, enemyKey, this.coursePath);
        this.applyLoopScaling(enemy);
        this.combatManager.addEnemy(enemy);
    }

    onWaveClear() {
        this.waveActive = false;
        window.soundEngine.playVictory();
        this.addScore(300 * this.wave);

        if (this.wave < this.maxWave) {
            this.openRelicModal(() => {
                this.startWave(this.wave + 1);
            });
        }
    }

    openRelicModal(callbackOnSelect = null) {
        // 自動表示中のモーダル（Wave進行コールバック保持）をデバッグ操作が上書きして
        // 進行不能になる事故を防ぐガード
        if (this.relicModalOpen) return;

        const options = this.skillManager.getRandomRelicOptions(3);
        const modal = document.getElementById('relicModal');
        const container = document.getElementById('relicCardsContainer');
        container.innerHTML = '';

        if (options.length === 0) {
            if (callbackOnSelect) callbackOnSelect();
            return;
        }

        this.relicModalOpen = true;
        this.isPaused = true;

        options.forEach(relic => {
            const card = document.createElement('div');
            card.className = `relic-card ${relic.rarity.toLowerCase()}`;
            card.innerHTML = `
                <div class="card-badge">${relic.rarity}</div>
                <div class="card-icon">${relic.icon}</div>
                <div class="card-title">${relic.name}</div>
                <div class="card-desc">${relic.desc}</div>
            `;
            card.addEventListener('click', () => {
                this.skillManager.acquireRelic(relic);
                modal.classList.add('hidden');
                this.relicModalOpen = false;
                this.isPaused = false;
                this.renderActiveRelicsUI();
                if (callbackOnSelect) callbackOnSelect();
            });
            container.appendChild(card);
        });

        modal.classList.remove('hidden');
    }

    renderActiveRelicsUI() {
        const container = document.getElementById('activeRelicsBar');
        if (!container) return;
        container.innerHTML = '';
        this.skillManager.activeRelics.forEach(r => {
            const icon = document.createElement('span');
            icon.className = 'relic-badge';
            icon.title = `${r.name}: ${r.desc}`;
            icon.textContent = r.icon;
            container.appendChild(icon);
        });
    }

    loop(timestamp) {
        const rawDt = Math.min((timestamp - this.lastTime) / 1000, 0.1);
        this.lastTime = timestamp;

        const dt = rawDt * (this.isPaused ? 0 : this.gameSpeed);

        if (!this.isPaused) {
            if (this.infiniteMana) {
                this.mana = this.maxMana;
            } else {
                this.mana = Math.min(this.maxMana, this.mana + this.manaRegen * dt);
            }

            for (const k in this.ballCooldowns) {
                if (this.ballCooldowns[k] > 0) {
                    this.ballCooldowns[k] = Math.max(0, this.ballCooldowns[k] - dt);
                }
            }

            if (this.relicState.fortress_repair) {
                this.allyBase.heal(this.allyBase.maxHp * 0.03 * dt);
            }

            const isBooster = this.skillManager.isBoosterActive();

            const continueGame = this.effectManager.update(dt, isBooster);
            if (continueGame) {
                this.combatManager.update(dt, isBooster);
                this.skillManager.update(dt);
                this.allyBase.update(dt);
                this.enemyBase.update(dt);
                this.updateWaveSpawner(dt);
            }

            if (!this.isGameOver && !this.isVictory) {
                if (this.allyBase.hp <= 0) {
                    this.finalizeDefeat();
                } else if (this.enemyBase.hp <= 0 && !this.enemyBase.hasBarrier) {
                    // 敵要塞破壊による完全制圧（バリア解除後、かつ敵部隊が残っていない場合）
                    if (!this.bossSpawned || (this.titanBoss && !this.titanBoss.isAlive && this.combatManager.enemies.length === 0)) {
                        this.finalizeVictory();
                    }
                }
            }
        }

        this.render();
        this.updateHUD();

        requestAnimationFrame(this.loop.bind(this));
    }

    render() {
        const ctx = this.ctx;
        const w = GAME_CONFIG.CANVAS_WIDTH;
        const h = GAME_CONFIG.CANVAS_HEIGHT;

        ctx.save();
        ctx.translate(this.effectManager.shakeX, this.effectManager.shakeY);

        // 1. スロープ背景（木目・トイ調デスク）
        ctx.fillStyle = '#181e24';
        ctx.fillRect(0, 0, w, h);

        // 背景グリッド（スケッチのノート風の方眼・ガイドライン）
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.lineWidth = 1;
        for (let x = 0; x < w; x += 30) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
        }
        for (let y = 0; y < h; y += 30) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }

        // 2. スケッチ通りの「板（スロープ台）」と点線矢印レールを描画
        const isBooster = this.skillManager.isBoosterActive();
        this.effectManager.renderBoards(ctx, this.coursePath, isBooster);

        // 3. 拠点（右上自陣ゲート・左下敵要塞）描画
        this.allyBase.render(ctx);
        this.enemyBase.render(ctx);

        // 4. 必殺技（ギガロック等）描画
        this.skillManager.render(ctx);

        // 5. 戦闘ユニット（ボール・敵）描画
        this.combatManager.render(ctx);

        // 6. パーティクル・バンパー・ダメージテキスト描画
        this.effectManager.render(ctx);

        // 7. ボス大型HPバー（Wave 4 でボス生存時）
        if (this.titanBoss && this.titanBoss.isAlive) {
            ctx.save();
            const barW = 320;
            const barH = 12;
            const bx = (w - barW) / 2;
            const by = 22;

            // 背景プレート
            ctx.fillStyle = 'rgba(15, 15, 20, 0.9)';
            ctx.fillRect(bx - 8, by - 16, barW + 16, barH + 24);
            ctx.strokeStyle = '#d63031';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(bx - 8, by - 16, barW + 16, barH + 24);

            // ボス名プレート
            ctx.font = 'bold 11px sans-serif';
            ctx.fillStyle = '#ff7675';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText('👑 超巨神 タイタン (SUPER BOSS)', bx, by - 6);

            // HPテキスト
            ctx.textAlign = 'right';
            ctx.fillText(`${Math.round(this.titanBoss.hp)} / ${this.titanBoss.maxHp}`, bx + barW, by - 6);

            // HPバー背景
            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.fillRect(bx, by + 1, barW, barH);

            // HPバー本体（グラデーション）
            const fillPct = Math.max(0, this.titanBoss.hp / this.titanBoss.maxHp);
            const fillW = barW * fillPct;
            const hpGrad = ctx.createLinearGradient(bx, 0, bx + barW, 0);
            hpGrad.addColorStop(0, '#c0392b');
            hpGrad.addColorStop(0.5, '#e74c3c');
            hpGrad.addColorStop(1, '#f39c12');
            ctx.fillStyle = hpGrad;
            ctx.fillRect(bx, by + 1, fillW, barH);

            // 光彩ライン
            ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
            ctx.fillRect(bx, by + 1, fillW, 2);

            ctx.restore();
        }

        ctx.restore();
    }

    updateHUD() {
        const scoreDisplay = document.getElementById('scoreDisplay');
        if (scoreDisplay) {
            scoreDisplay.textContent = this.loopCount > 0
                ? `Score: ${this.score} (${this.loopCount + 1}周目)`
                : `Score: ${this.score}`;
        }

        const manaBar = document.getElementById('manaFill');
        const manaText = document.getElementById('manaText');
        if (manaBar && manaText) {
            const pct = Math.min(100, (this.mana / this.maxMana) * 100);
            manaBar.style.width = `${pct}%`;
            manaText.textContent = `${Math.floor(this.mana)} / ${this.maxMana}`;
        }

        const allyHpFill = document.getElementById('allyHpFill');
        const allyHpText = document.getElementById('allyHpText');
        if (allyHpFill && allyHpText) {
            const pct = Math.max(0, (this.allyBase.hp / this.allyBase.maxHp) * 100);
            allyHpFill.style.width = `${pct}%`;
            allyHpText.textContent = `${Math.round(this.allyBase.hp)} / ${this.allyBase.maxHp}`;
        }

        const enemyHpFill = document.getElementById('enemyHpFill');
        const enemyHpText = document.getElementById('enemyHpText');
        if (enemyHpFill && enemyHpText) {
            const pct = Math.max(0, (this.enemyBase.hp / this.enemyBase.maxHp) * 100);
            enemyHpFill.style.width = `${pct}%`;
            if (this.enemyBase.hasBarrier) {
                enemyHpText.textContent = `🛡️ 障壁中 (${Math.round(this.enemyBase.hp)})`;
                enemyHpFill.style.background = 'linear-gradient(90deg, #00cec9, #0984e3)';
            } else {
                enemyHpText.textContent = `${Math.round(this.enemyBase.hp)} / ${this.enemyBase.maxHp}`;
                enemyHpFill.style.background = 'linear-gradient(90deg, #b71540, #e74c3c)';
            }
        }

        document.querySelectorAll('.ball-btn').forEach(btn => {
            const type = btn.dataset.type;
            const config = BALL_TYPES[type.toUpperCase()];
            const cd = this.ballCooldowns[type];
            const cdOverlay = btn.querySelector('.cd-overlay');

            if (cd > 0) {
                btn.classList.add('disabled');
                if (cdOverlay) cdOverlay.style.height = `${(cd / config.cooldown) * 100}%`;
            } else if (!this.infiniteMana && this.mana < config.cost) {
                btn.classList.add('disabled');
                if (cdOverlay) cdOverlay.style.height = '0%';
            } else {
                btn.classList.remove('disabled');
                if (cdOverlay) cdOverlay.style.height = '0%';
            }
        });

        document.querySelectorAll('.skill-btn').forEach(btn => {
            const skillId = btn.dataset.skill;
            const config = SPECIAL_SKILLS[skillId.toUpperCase()];
            const cd = this.skillManager.cooldowns[skillId];
            const cdOverlay = btn.querySelector('.skill-cd-overlay');
            const cdText = btn.querySelector('.skill-cd-text');

            if (cd > 0) {
                btn.classList.add('on-cooldown');
                if (cdOverlay) cdOverlay.style.height = `${(cd / config.cooldown) * 100}%`;
                if (cdText) cdText.textContent = cd.toFixed(1) + 's';
            } else {
                btn.classList.remove('on-cooldown');
                if (cdOverlay) cdOverlay.style.height = '0%';
                if (cdText) cdText.textContent = '';
            }
        });
    }
}

window.onload = () => {
    window.gameManager = new GameManager();
    window.gameManager.init();
};
