export class BrigandyneActorSheet extends ActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["brigandyne2", "sheet", "actor"],
      template: "systems/brigandyne2/templates/actor-sheet.hbs",
      width: 800, height: 900,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "stats" }]
    });
  }

  getData() {
    const context = super.getData();
    context.system = context.actor.system; 

    context.magicOptions = {
      "cns": "Connaissances",
      "vol": "Volonté",
      "mag": "Magie"
    };

    context.pnjTypes = {
      "sbire": "Sbire",
      "standard": "Standard",
      "majeur": "Majeur / Boss"
    };

    context.showMagicTab = true;
    if (context.actor.type === "pnj" && context.system.type_pnj === "sbire") {
        context.showMagicTab = false;
    }

    context.armes = [];
    context.armures = [];
    context.objets = [];
    context.atouts = [];
    context.sorts = [];
    context.origines = [];
    context.archetypes = [];
    context.carrieres = [];
    context.domaines = [];
    context.tours = [];
    context.sortileges = [];

    for (let i of context.items) {
      if (i.type === 'arme') context.armes.push(i);
      else if (i.type === 'armure') context.armures.push(i);
      else if (i.type === 'objet') context.objets.push(i);
      else if (i.type === 'atout') context.atouts.push(i);
      else if (i.type === 'origine') context.origines.push(i);
      else if (i.type === 'archetype') context.archetypes.push(i);
      else if (i.type === 'carriere') context.carrieres.push(i);
      else if (i.type === 'domaine') context.domaines.push(i);
      else if (i.type === 'sort') {
          context.sorts.push(i);
          if (i.system.type_sort === 'tour') context.tours.push(i);
          else context.sortileges.push(i);
      }
    }

    context.nbToursActuels = context.tours.length;
    context.nbSortsActuels = context.sortileges.length;
    
    let maxDest = 0;
    if (context.origines.length > 0) {
        maxDest = Number(context.origines[0].system.destin) || 0;
    }
    
    if (!context.system.destin) context.system.destin = { value: 0 };
    context.system.destin.max = maxDest;
    const activeCarriere = context.items.find(i => i.type === 'carriere');

    for (let [key, stat] of Object.entries(context.system.stats)) {
      stat.progressBoxes = [];
      const maxProg = activeCarriere ? (activeCarriere.system.stats[key] || 0) : 0; 
      const currentProg = stat.progression || 0;
      
      for (let i = 1; i <= 6; i++) {
        stat.progressBoxes.push({
          value: i,
          statKey: key,
          locked: i > maxProg && i > currentProg,
          checked: i <= currentProg
        });
      }
    }

    if (context.actor.type === "personnage" || context.showMagicTab) {
      const magIndice = context.system.stats.mag?.indice || 0; 
      const magScore = context.system.stats.mag?.total || 0;
      const cnsIndice = context.system.stats.cns?.indice || 0;

      context.maxDomaines = 0;
      if (magScore >= 1 && magScore <= 49) context.maxDomaines = 1;
      else if (magScore >= 50 && magScore <= 69) context.maxDomaines = 2;
      else if (magScore >= 70 && magScore <= 89) context.maxDomaines = 3;
      else if (magScore >= 90 && magScore <= 99) context.maxDomaines = 4;
      else if (magScore >= 100) context.maxDomaines = 5;

      context.creationSorts = cnsIndice;

      if (!context.system.magie) context.system.magie = { uses: { tours: 0, sorts: 0, rituels: 0 } };
      
      const currentUses = context.system.magie.uses;

      context.toursBoxes = [];
      for (let i = 1; i <= magIndice; i++) {
        context.toursBoxes.push({
          value: i,
          checked: i <= currentUses.tours
        });
      }

      context.sortsBoxes = [];
      for (let i = 1; i <= magIndice; i++) {
        context.sortsBoxes.push({
          value: i,
          checked: i <= currentUses.sorts
        });
      }

      context.rituelBox = { checked: currentUses.rituels > 0 };
    }

    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);
    if (!this.isEditable) return;

    // === NOUVEAU : INITIATIVE INTELLIGENTE (COMBAT TRACKER) ===
    html.find('.roll-init').click(async ev => {
        ev.preventDefault();
        
        // Si un combat est actif dans Foundry
        if (game.combat) {
            // On utilise la fonction native de Foundry pour lancer l'initiative et l'ajouter au Tracker
            await this.actor.rollInitiative({ createCombatants: true });
        } else {
            // S'il n'y a pas de combat en cours, on fait un jet standard dans le chat
            const initValue = this.actor.system.initiative?.value || 0;
            const roll = new Roll(`1d10 + ${initValue}`);
            await roll.evaluate();
            
            const content = `
            <div class="brigandyne-roll">
                <h3 style="border-bottom: 1px solid #444; margin-bottom: 5px; color: #fff;">Initiative</h3>
                <div class="dice-result">
                    <div class="dice-total success" style="font-size: 1.5em;">${roll.total}</div>
                </div>
            </div>`;
            
            ChatMessage.create({
                user: game.user._id,
                speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                content: content,
                rolls: [roll]
            });
        }
    });

    html.find('.rollable').click(this._onRoll.bind(this));
    html.find('.spell-roll').click(this._onSpellRoll.bind(this));
    html.find('.item-rollable').click(this._onItemRoll.bind(this));
    html.find('.archive-career').click(this._onArchiveCareer.bind(this));
    html.find('.item-equip-toggle').change(this._onToggleEquip.bind(this));
    html.find('.prog-box').click(this._onProgressBoxClick.bind(this));
    html.find('.spell-use-box').click(this._onSpellUseBoxClick.bind(this));

    html.find('.prog-box').click(async ev => {
        ev.preventDefault();
        const box = $(ev.currentTarget);
        const statKey = box.data("stat");
        const boxValue = parseInt(box.data("value")); 
        
        const stat = this.actor.system.stats[statKey];
        const currentProg = stat.progression || 0;
        const currentXP = Number(this.actor.system.experience?.value) || 0;

        const getCost = (targetScore) => {
            if (targetScore <= 50) return 100;
            if (targetScore <= 60) return 150;
            if (targetScore <= 70) return 200;
            if (targetScore <= 80) return 250;
            if (targetScore <= 90) return 300;
            return 350;
        };

        if (box.hasClass('checked')) {
            if (boxValue !== currentProg) {
                return ui.notifications.warn("Vous devez annuler la dernière progression en premier (de droite à gauche).");
            }
            const costToRefund = getCost(stat.total); 
            
            new Dialog({
                title: "Annuler la progression",
                content: `<p>Voulez-vous annuler cette progression en <strong>${stat.label}</strong> et récupérer <strong>${costToRefund} PX</strong> ?</p>`,
                buttons: {
                    yes: {
                        icon: '<i class="fas fa-undo"></i>',
                        label: "Rembourser",
                        callback: async () => {
                            await this.actor.update({
                                [`system.stats.${statKey}.progression`]: currentProg - 1,
                                "system.experience.value": currentXP + costToRefund
                            });
                        }
                    },
                    no: { icon: '<i class="fas fa-times"></i>', label: "Conserver" }
                },
                default: "no"
            }).render(true);
            return;
        }

        if (boxValue !== currentProg + 1) {
            return ui.notifications.warn("Vous devez cocher les cases de progression dans l'ordre de gauche à droite !");
        }

        const targetScore = stat.total + 5;
        let baseCost = getCost(targetScore);
        let isHorsProfil = box.hasClass('locked');
        
        let dialogContent = `
            <div style="margin-bottom: 10px; font-size: 1.1em; text-align: center;">
                Faire passer <strong>${stat.label}</strong> de ${stat.total} à <strong style="color: #1a5b1a;">${targetScore}</strong> coûte normalement <strong style="color: #8b6d05;">${baseCost} PX</strong>.
            </div>
        `;

        if (isHorsProfil) {
            dialogContent += `
            <div style="background: rgba(139,0,0,0.1); border: 1px dashed #8b0000; padding: 10px; margin-bottom: 10px; border-radius: 4px;">
                <strong style="color: #8b0000;"><i class="fas fa-dumbbell"></i> Entraînement Hors Profil !</strong><br>
                <span style="font-size: 0.9em; color: #555;">Selon les règles, développer une compétence hors carrière nécessite un instructeur et coûte plus cher en PX.</span><br>
                <label style="display: flex; align-items: center; margin-top: 8px; font-weight: bold; color: #111;">
                    Coût modifié (PX) : 
                    <input type="number" id="manualCost" value="${baseCost * 2}" style="width: 70px; margin-left: 10px; text-align: center; border: 1px solid #444;">
                </label>
            </div>`;
        }

        new Dialog({
            title: "Entraînement & Progression",
            content: dialogContent,
            buttons: {
                buy: {
                    icon: '<i class="fas fa-arrow-up"></i>',
                    label: "Dépenser l'XP",
                    callback: async (html) => {
                        let finalCost = isHorsProfil ? (parseInt(html.find('#manualCost').val()) || baseCost) : baseCost;
                        
                        if (currentXP < finalCost) {
                            return ui.notifications.error(`Expérience insuffisante ! Il vous faut ${finalCost} PX.`);
                        }

                        await this.actor.update({
                            [`system.stats.${statKey}.progression`]: currentProg + 1,
                            "system.experience.value": currentXP - finalCost
                        });
                        
                        ui.notifications.info(`${stat.label} progresse à ${targetScore} ! (-${finalCost} PX)`);
                    }
                },
                cancel: {
                    icon: '<i class="fas fa-times"></i>',
                    label: "Annuler"
                }
            },
            default: "buy"
        }).render(true);
    });

    html.find('.spend-xp-btn').click(async ev => {
        ev.preventDefault();
        const currentXP = Number(this.actor.system.experience?.value) || 0;

        let dialogContent = `
        <div style="text-align: center; margin-bottom: 15px;">
            <p>Que souhaitez-vous acheter avec vos PX ?</p>
            <p>Expérience disponible : <strong style="color: #1a5b1a; font-size: 1.2em;">${currentXP} PX</strong></p>
        </div>
        <div class="form-group" style="margin-bottom: 15px;">
            <select id="xp-purchase" style="width: 100%; padding: 5px;">
                <option value="100|Changement de carrière">Changement de carrière (100 PX)</option>
                <option value="100|Atout (Carrière)">Spécialité ou Talent de la carrière (100 PX)</option>
                <option value="150|Atout (Hors-carrière)">Spécialité ou Talent hors-carrière (150 PX)</option>
                <option value="50|Apprentissage d'un nouveau sort">Apprentissage d'un nouveau sort (50 PX)</option>
                <option value="custom|Autre dépense">Autre dépense (Saisie manuelle)</option>
            </select>
        </div>
        <div class="form-group custom-xp-group" style="display: none; justify-content: space-between; align-items: center;">
            <label style="font-weight: bold;">Montant (PX) :</label>
            <input type="number" id="xp-custom-val" value="50" style="width: 80px; text-align: center;">
        </div>
        <script>
            $('#xp-purchase').change(function() {
                if($(this).val().startsWith('custom')) $('.custom-xp-group').css('display', 'flex');
                else $('.custom-xp-group').hide();
            });
        </script>
        `;

        new Dialog({
            title: "Dépense d'Expérience",
            content: dialogContent,
            buttons: {
                buy: {
                    icon: '<i class="fas fa-check"></i>',
                    label: "Acheter",
                    callback: async (html) => {
                        let selection = html.find('#xp-purchase').val().split('|');
                        let cost = selection[0] === 'custom' ? parseInt(html.find('#xp-custom-val').val()) : parseInt(selection[0]);
                        let reason = selection[1];

                        if (isNaN(cost) || cost <= 0) return ui.notifications.warn("Montant invalide.");
                        if (currentXP < cost) {
                            return ui.notifications.error(`Expérience insuffisante ! (Requis: ${cost}, Actuel: ${currentXP})`);
                        }

                        await this.actor.update({"system.experience.value": currentXP - cost});

                        ChatMessage.create({
                            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                            content: `
                            <div class="brigandyne-roll" style="border: 1px solid #d4af37; background: rgba(0,0,0,0.8);">
                                <h3 style="color: #d4af37; border-bottom: 1px dashed #d4af37; margin-bottom: 10px;">
                                    <i class="fas fa-star"></i> Évolution !
                                </h3>
                                <p style="text-align: center; font-size: 1.05em; color: #e0e0e0;">
                                    <strong>${this.actor.name}</strong> dépense <strong>${cost} PX</strong> pour l'acquisition suivante :<br>
                                    <span style="color: #85c1e9; font-weight: bold; font-size: 1.1em; display: inline-block; margin-top: 5px;">${reason}</span>
                                </p>
                            </div>`
                        });
                    }
                },
                cancel: { icon: '<i class="fas fa-times"></i>', label: "Annuler" }
            },
            default: "buy"
        }).render(true);
    });

    html.find('.item-toggle').click(ev => {
        ev.preventDefault();
        const li = $(ev.currentTarget).parents(".item");
        const summary = li.find(".item-summary");
        summary.slideToggle(200); 
    });

    html.find('.item-create').click(this._onItemCreate.bind(this));

    html.find('.item-edit').click(ev => {
      const li = $(ev.currentTarget).parents(".item");
      const item = this.actor.items.get(li.data("itemId"));
      item.sheet.render(true);
    });

    html.find('.item-delete').click(ev => {
      const li = $(ev.currentTarget).parents(".item");
      this.actor.deleteEmbeddedDocuments("Item", [li.data("itemId")]);
      li.slideUp(200, () => this.render(false));
    });

    html.find('.ignore-handicap-btn').click(async ev => {
        ev.preventDefault();
        const sf = Number(this.actor.system.sangfroid?.value) || 0;
        
        if (sf >= 2) {
            await this.actor.update({"system.sangfroid.value": sf - 2});
            ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                content: `
                <div class="brigandyne-roll" style="border: 2px solid #8b0000; padding: 10px; background: rgba(0,0,0,0.8);">
                    <h3 style="color: #ffcccc; margin-bottom: 5px; border-bottom: 1px dashed #ffcccc; padding-bottom: 5px;">
                        <i class="fas fa-fire-alt"></i> Dépassement de soi !
                    </h3>
                    <p style="color: #e0e0e0; font-size: 1.1em; text-align: center; margin-top: 5px;">
                        <strong>${this.actor.name}</strong> puise dans ses ultimes réserves et dépense <strong>2 points de Sang-Froid</strong> pour ignorer l'effet de ses handicaps pendant ce tour !
                    </p>
                </div>`
            });
        } else {
            ui.notifications.warn("Pas assez de Sang-Froid pour ignorer un handicap !");
        }
    });
  }

  _onRoll(event) {
    event.preventDefault();
    const dataset = event.currentTarget.dataset;
    if (dataset.key) this.actor.rollStat(dataset.key);
  }

  async _onItemCreate(event) {
    event.preventDefault();
    const header = event.currentTarget;
    const type = header.dataset.type;

    if (type === "origine") {
      const hasOrigine = this.actor.items.some(i => i.type === "origine");
      if (hasOrigine) {
        ui.notifications.error("Un personnage ne peut avoir qu'une seule Origine !");
        return null;
      }
    }

    if (type === "archetype") {
      const hasArchetype = this.actor.items.some(i => i.type === "archetype");
      if (hasArchetype) {
        ui.notifications.error("Un personnage ne peut avoir qu'un seul Archétype !");
        return null;
      }
    }
    if (type === "carriere") {
      const hasCarriere = this.actor.items.some(i => i.type === "carriere");
      if (hasCarriere) {
        ui.notifications.error("Un personnage ne peut avoir qu'une seule Carrière active !");
        return null;
      }
    }

    let defaultImg = "icons/svg/mystery-rosette.svg"; 
    if (type === "arme") defaultImg = "icons/svg/sword.svg";
    else if (type === "armure") defaultImg = "icons/svg/shield.svg";
    else if (type === "sort") defaultImg = "icons/svg/book.svg";
    else if (type === "atout") defaultImg = "icons/svg/upgrade.svg";
    else if (type === "domaine") defaultImg = "icons/svg/daze.svg";

    const itemData = {
      name: `Nouveau ${type}`,
      type: type,
      img: defaultImg 
    };
    
    return Item.create(itemData, {parent: this.actor});
  }

  _onItemRoll(event) {
    event.preventDefault();
    const itemId = event.currentTarget.closest(".item").dataset.itemId; 
    if (itemId) this.actor.rollWeapon(itemId); 
  }

  _onSpellRoll(event) {
    event.preventDefault();
    const itemId = event.currentTarget.closest(".item").dataset.itemId;
    if (itemId) this.actor.rollSpell(itemId);
  }

  async _onToggleEquip(event) {
    event.preventDefault();
    const itemId = event.currentTarget.dataset.itemId;
    const item = this.actor.items.get(itemId);
    
    if (item) {
      const isEquipped = item.system.equipe;
      await item.update({ "system.equipe": !isEquipped });
    }
  }

  async _onDropItemCreate(itemData) {
    let items = Array.isArray(itemData) ? itemData : [itemData];
    let itemsToCreate = [];

    const magScore = this.actor.system.stats?.mag?.total || 0;
    const cnsIndice = this.actor.system.stats?.cns?.indice || 0; 
        
    let maxDomaines = 1;
    if (magScore >= 50 && magScore <= 69) maxDomaines = 2;
    else if (magScore >= 70 && magScore <= 89) maxDomaines = 3;
    else if (magScore >= 90 && magScore <= 99) maxDomaines = 4;
    else if (magScore >= 100) maxDomaines = 5;

    for (let item of items) {

        const isDuplicate = this.actor.items.some(i => i.name === item.name && i.type === item.type);
        if (isDuplicate) continue; 

        if (item.type === "domaine") {
            const nbDomaines = this.actor.items.filter(i => i.type === "domaine").length;
            if (nbDomaines >= maxDomaines) {
                ui.notifications.error(`Limite atteinte : Avec ${magScore} en MAG, vous ne pouvez posséder que ${maxDomaines} domaine(s) !`);
                continue;
            }
        }

        if (item.type === "sort") {
            const isTour = item.system.type_sort === "tour";
            const nbTours = this.actor.items.filter(i => i.type === "sort" && i.system.type_sort === "tour").length;
            const nbSorts = this.actor.items.filter(i => i.type === "sort" && i.system.type_sort !== "tour").length;

            if (isTour && nbTours >= cnsIndice) {
                ui.notifications.warn(`Attention : Vous dépassez votre limite de création de *CNS* (${cnsIndice}) Tours.`);
            }
            if (!isTour && nbSorts >= cnsIndice) {
                ui.notifications.warn(`Attention : Vous dépassez votre limite de création de *CNS* (${cnsIndice}) Sortilèges/Rituels.`);
            }
        }

        if (["origine", "archetype", "carriere"].includes(item.type)) {
            if (this.actor.type === "pnj") {
                ui.notifications.warn("Les PNJ n'ont pas d'Origine, d'Archétype ou de Carrière !");
                continue;
            }
            if (this.actor.items.some(i => i.type === item.type)) {
                ui.notifications.error(`Création annulée : ce personnage a déjà un(e) ${item.type} !`);
                continue;
            }
        }

        itemsToCreate.push(item);
    }

    if (itemsToCreate.length === 0) return false;
    
    const createdDocuments = await super._onDropItemCreate(itemsToCreate);
    const itemsArray = Array.isArray(createdDocuments) ? createdDocuments : [createdDocuments];

    for (let item of itemsArray) {
        if (item && item.type === "origine") {
            let ptsDestin = Number(item.system.destin) || 0;
            if (ptsDestin > 0) {
                await this.actor.update({ "system.destin.value": ptsDestin });
                ui.notifications.info(`Le Destin du personnage a été initialisé à ${ptsDestin}.`);
            }
        }
    }
    return createdDocuments;
  }

 async _onProgressBoxClick(event) {
  event.preventDefault();
  const box = event.currentTarget;
  
  if (box.classList.contains("locked")) return;

  const statKey = box.dataset.stat;
  if (!statKey) return;

  const clickedValue = parseInt(box.dataset.value);
  
  const stat = this.actor.system.stats[statKey];
  if (!stat) return;

  const currentProg = stat.progression || 0;

  let newProg = clickedValue;
  if (clickedValue === currentProg) {
      newProg = clickedValue - 1;
  }

  await this.actor.update({ [`system.stats.${statKey}.progression`]: newProg });
}

  async _onSpellUseBoxClick(event) {
    event.preventDefault();
    const box = event.currentTarget;
    const type = box.dataset.type; 
    const clickedValue = parseInt(box.dataset.value);

    let currentUses = this.actor.system.magie?.uses?.[type] || 0;

    let newUses = clickedValue;
    if (clickedValue === currentUses) {
        newUses = clickedValue - 1;
    }

    await this.actor.update({ [`system.magie.uses.${type}`]: newUses });
  }

  async _onArchiveCareer(event) {
    event.preventDefault();
    
    const activeCarriere = this.actor.items.find(i => i.type === 'carriere');
    if (!activeCarriere) {
        return ui.notifications.warn("Aucune carrière active à archiver !");
    }

    const confirm = await Dialog.confirm({
        title: "Archiver la carrière",
        content: `<p>Voulez-vous vraiment archiver la carrière <strong>${activeCarriere.name}</strong> ?</p>
                  <p>Elle sera déplacée dans vos anciennes carrières pour faire de la place à la nouvelle.</p>`,
        yes: () => true,
        no: () => false,
        defaultYes: false
    });

    if (!confirm) return;

    let history = this.actor.system.carrieres_historiques || "";
    if (history.trim() !== "") {
        history += ", " + activeCarriere.name; 
    } else {
        history = activeCarriere.name; 
    }

    await this.actor.update({ "system.carrieres_historiques": history });
    await this.actor.deleteEmbeddedDocuments("Item", [activeCarriere.id]);
    
    ui.notifications.info(`La carrière ${activeCarriere.name} a été archivée avec succès.`);
  }
}