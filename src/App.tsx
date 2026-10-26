import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Coins,
  Layers,
  Swords,
  Trash2,
  Unlock,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { soundEngine } from './audio/soundEngine';
import { CardBinder } from './components/CardBinder';
import { DeckBuilder } from './components/DeckBuilder';
import { MatchScreen } from './components/MatchScreen';
import { OpponentSelect } from './components/OpponentSelect';
import {
  applyMatchOutcomeToProfile,
  createDefaultProfile,
  getEffectiveRank,
  grantOrBuyCard,
  isBinderComplete,
  loadProfile,
  saveProfile,
  type ExtendedPlayerProfile,
} from './state/profileStore';
import type { MatchRuleId, NpcOpponent } from './types/bnd';

type NavTab = 'tavern' | 'deckbuilder' | 'binder';

export const App: React.FC = () => {
  const [profile, setProfile] = useState<ExtendedPlayerProfile>(() => loadProfile());
  const [activeTab, setActiveTab] = useState<NavTab>('tavern');
  const [activeChallenge, setActiveChallenge] = useState<{
    opponent: NpcOpponent;
    rules: MatchRuleId[];
  } | null>(null);
  const [muted, setMuted] = useState<boolean>(() => soundEngine.isMuted());
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  useEffect(() => {
    saveProfile(profile);
  }, [profile]);

  const effectiveRank = getEffectiveRank(profile);
  const binderComplete = isBinderComplete(profile);
  const collectedCount = profile.sandboxUnlockAll ? 105 : profile.everCollected.length;

  const activeDeck = useMemo(
    () => profile.decks.find((d) => d.id === profile.activeDeckId) ?? profile.decks[0],
    [profile.decks, profile.activeDeckId]
  );

  const handleToggleSandbox = useCallback(() => {
    setProfile((prev) => ({
      ...prev,
      sandboxUnlockAll: !prev.sandboxUnlockAll,
    }));
  }, []);

  const handleSelectActiveDeck = useCallback((deckId: string) => {
    setProfile((prev) => ({
      ...prev,
      activeDeckId: deckId,
    }));
  }, []);

  const handleUpdateDeck = useCallback((deckId: string, name: string, cards: number[]) => {
    setProfile((prev) => ({
      ...prev,
      decks: prev.decks.map((d) => (d.id === deckId ? { ...d, name, cards } : d)),
    }));
  }, []);

  const handleBuyOrClaimCard = useCallback(
    (cardId: number, cost: number, npcId?: string) => {
      setProfile((prev) => grantOrBuyCard(prev, cardId, cost, npcId));
    },
    []
  );

  const handleFinishMatchOutcome = useCallback(
    (params: { earnedPoints: number; won: boolean; lostCardId?: number }) => {
      if (!activeChallenge) return;
      setProfile((prev) =>
        applyMatchOutcomeToProfile(prev, {
          npcId: activeChallenge.opponent.id,
          earnedPoints: params.earnedPoints,
          won: params.won,
          lostCardId: params.lostCardId,
        })
      );
    },
    [activeChallenge]
  );

  return (
    <div className="bnd-app">
      {/* Global Tavern Header */}
      <header className="bnd-header">
        <div className="bnd-brand">
          <div className="bnd-brand__crest">✦</div>
          <div>
            <h1 className="bnd-brand__title">B’n’D — Bind &amp; Divide</h1>
            <p className="bnd-brand__sub">Bravely Default II • Complete 105-Card Edition</p>
          </div>
        </div>

        {!activeChallenge ? (
          <nav className="bnd-nav" aria-label="Main Navigation">
            <button
              type="button"
              className={`bnd-nav__tab ${activeTab === 'tavern' ? 'is-active' : ''}`}
              onClick={() => {
                soundEngine.playHover();
                setActiveTab('tavern');
              }}
            >
              <Swords size={16} /> Tavern Duelists
            </button>
            <button
              type="button"
              className={`bnd-nav__tab ${activeTab === 'deckbuilder' ? 'is-active' : ''}`}
              onClick={() => {
                soundEngine.playHover();
                setActiveTab('deckbuilder');
              }}
            >
              <Layers size={16} /> Deck Builder
            </button>
            <button
              type="button"
              className={`bnd-nav__tab ${activeTab === 'binder' ? 'is-active' : ''}`}
              onClick={() => {
                soundEngine.playHover();
                setActiveTab('binder');
              }}
            >
              <BookOpen size={16} /> Card Binder ({collectedCount}/105)
            </button>
          </nav>
        ) : (
          <div className="bnd-live-indicator">
            <Swords size={15} /> Match vs. <strong>{activeChallenge.opponent.name}</strong>
          </div>
        )}

        <div className="bnd-hud">
          <span className={`bnd-rank-tag rank-${effectiveRank}`}>Rank {effectiveRank}</span>
          <span className="bnd-hud__pts" title="B'n'D Points (Spend in Binder or Post-Match Shop)">
            <Coins size={15} /> {profile.points} Pt
          </span>

          <button
            type="button"
            className={`bnd-btn bnd-btn--sm ${
              profile.sandboxUnlockAll ? 'bnd-btn--gold' : 'bnd-btn--ghost'
            }`}
            onClick={() => {
              soundEngine.playCharacterAura();
              handleToggleSandbox();
            }}
            title="Toggle Sandbox Mode (Unlocks all 105 cards, all Ranks C–S, and prevents Keepsies card loss)"
          >
            <Unlock size={14} /> {profile.sandboxUnlockAll ? 'Sandbox ON' : 'Sandbox'}
          </button>

          <button
            type="button"
            className="bnd-icon-btn"
            onClick={() => setMuted(soundEngine.toggleMute())}
            title={muted ? 'Unmute Sound Effects' : 'Mute Sound Effects'}
            aria-label={muted ? 'Unmute Sound Effects' : 'Mute Sound Effects'}
          >
            {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
          </button>

          {!activeChallenge && (
            <button
              type="button"
              className="bnd-icon-btn bnd-icon-btn--danger"
              onClick={() => setShowResetConfirm(true)}
              title="Reset Save Data"
              aria-label="Reset Save Data"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </header>

      {/* Main Content Stage */}
      <main className="bnd-main">
        {activeChallenge ? (
          <MatchScreen
            opponent={activeChallenge.opponent}
            playerDeck={activeDeck.cards}
            matchRules={activeChallenge.rules}
            profile={profile}
            allBinderCollected={binderComplete}
            onFinishOutcome={handleFinishMatchOutcome}
            onClaimRewardCard={(cardId, cost) =>
              handleBuyOrClaimCard(cardId, cost, activeChallenge.opponent.id)
            }
            onBackToTavern={() => {
              soundEngine.playHover();
              setActiveChallenge(null);
            }}
          />
        ) : activeTab === 'tavern' ? (
          <OpponentSelect
            profile={profile}
            onSelectActiveDeck={handleSelectActiveDeck}
            onStartMatch={(opponent, rules) => setActiveChallenge({ opponent, rules })}
          />
        ) : activeTab === 'deckbuilder' ? (
          <DeckBuilder
            profile={profile}
            onUpdateDeck={handleUpdateDeck}
            onSelectActiveDeck={handleSelectActiveDeck}
          />
        ) : (
          <CardBinder
            profile={profile}
            onBuyCard={(cardId, cost) => handleBuyOrClaimCard(cardId, cost)}
            onToggleSandbox={handleToggleSandbox}
          />
        )}
      </main>

      {/* Reset Save Confirmation Modal */}
      {showResetConfirm && (
        <div className="bnd-modal-backdrop" onClick={() => setShowResetConfirm(false)}>
          <div className="bnd-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Reset B’n’D Save Data?</h2>
            <p className="bnd-modal-copy">
              This will restore your profile to the Savalon starter collection (7 cards, 25 Pt, Rank C).
              You can still toggle Sandbox Mode anytime.
            </p>
            <div className="bnd-modal__footer">
              <button
                type="button"
                className="bnd-btn bnd-btn--ghost"
                onClick={() => setShowResetConfirm(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="bnd-btn bnd-btn--danger"
                onClick={() => {
                  soundEngine.playNeutralize(2);
                  setProfile(createDefaultProfile());
                  setShowResetConfirm(false);
                }}
              >
                Reset Save Data
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
