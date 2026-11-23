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
import { useViewportMode } from './hooks/useViewportMode';
import { useBackHandler } from './native/backButton';
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
  const { isMobile, isMobilePortrait, isMobileLandscape } = useViewportMode();
  const [profile, setProfile] = useState<ExtendedPlayerProfile>(() => loadProfile());
  const [activeTab, setActiveTab] = useState<NavTab>('tavern');
  const [activeChallenge, setActiveChallenge] = useState<{
    opponent: NpcOpponent;
    rules: MatchRuleId[];
  } | null>(null);
  const [muted, setMuted] = useState<boolean>(() => soundEngine.isMuted());
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  useBackHandler(() => {
    if (showResetConfirm) {
      setShowResetConfirm(false);
      return true;
    }
    if (activeChallenge) {
      return false;
    }
    if (activeTab !== 'tavern') {
      setActiveTab('tavern');
      return true;
    }
    return false;
  }, 10);

  useEffect(() => {
    saveProfile(profile);
  }, [profile]);

  useEffect(() => {
    if (!showResetConfirm || typeof window === 'undefined') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowResetConfirm(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showResetConfirm]);

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

  const handleToggleMute = useCallback(() => {
    setMuted(soundEngine.toggleMute());
  }, []);

  const appClasses = [
    'bnd-app',
    isMobile ? 'is-mobile' : '',
    isMobilePortrait ? 'is-mobile-portrait' : '',
    isMobileLandscape ? 'is-mobile-landscape' : '',
    activeChallenge ? 'is-in-match' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const showHeader = !isMobile || !activeChallenge;
  const showBottomNav = isMobile && !activeChallenge;

  return (
    <div className={appClasses}>
      {/* Global Tavern Header (Hidden on mobile during live matches so arena owns 100dvh) */}
      {showHeader && (
        <header className={`bnd-header ${isMobile ? 'is-mobile-bar' : ''}`}>
          <div className="bnd-brand">
            <div className="bnd-brand__crest">✦</div>
            <div>
              <h1 className="bnd-brand__title">
                {isMobile ? 'B’n’D' : 'B’n’D — Bind & Divide'}
              </h1>
              {!isMobile && (
                <p className="bnd-brand__sub">Bravely Default II • Complete 105-Card Edition</p>
              )}
            </div>
          </div>

          {!isMobile &&
            (!activeChallenge ? (
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
            ))}

          <div className="bnd-hud">
            <span className={`bnd-rank-tag rank-${effectiveRank}`}>
              {isMobile ? effectiveRank : `Rank ${effectiveRank}`}
            </span>
            <span
              className="bnd-hud__pts"
              title="B'n'D Points (Spend in Binder or Post-Match Shop)"
            >
              <Coins size={14} /> {profile.points} Pt
            </span>

            <button
              type="button"
              className={`bnd-btn bnd-btn--sm ${
                profile.sandboxUnlockAll ? 'bnd-btn--gold' : 'bnd-btn--ghost'
              } ${isMobile ? 'bnd-hud__sandbox-mobile' : ''}`}
              onClick={() => {
                soundEngine.playCharacterAura();
                handleToggleSandbox();
              }}
              title="Toggle Sandbox Mode (Unlocks all 105 cards, all Ranks C–S, and prevents Keepsies card loss)"
              aria-label={profile.sandboxUnlockAll ? 'Sandbox ON' : 'Sandbox OFF'}
            >
              <Unlock size={14} />
              {isMobile
                ? profile.sandboxUnlockAll
                  ? 'ON'
                  : 'Sbx'
                : profile.sandboxUnlockAll
                ? 'Sandbox ON'
                : 'Sandbox'}
            </button>

            <button
              type="button"
              className="bnd-icon-btn"
              onClick={handleToggleMute}
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
      )}

      {/* Main Content Stage */}
      <main className="bnd-main">
        {activeChallenge ? (
          <MatchScreen
            opponent={activeChallenge.opponent}
            playerDeck={activeDeck.cards}
            matchRules={activeChallenge.rules}
            profile={profile}
            allBinderCollected={binderComplete}
            muted={muted}
            onToggleMute={handleToggleMute}
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

      {/* Mobile Fixed Bottom Navigation */}
      {showBottomNav && (
        <nav className="bnd-bottom-nav" aria-label="Mobile Navigation">
          <button
            type="button"
            className={`bnd-bottom-nav__tab ${activeTab === 'tavern' ? 'is-active' : ''}`}
            onClick={() => {
              soundEngine.playHover();
              setActiveTab('tavern');
            }}
          >
            <Swords size={18} />
            <span>Tavern</span>
          </button>
          <button
            type="button"
            className={`bnd-bottom-nav__tab ${activeTab === 'deckbuilder' ? 'is-active' : ''}`}
            onClick={() => {
              soundEngine.playHover();
              setActiveTab('deckbuilder');
            }}
          >
            <Layers size={18} />
            <span>Decks</span>
          </button>
          <button
            type="button"
            className={`bnd-bottom-nav__tab ${activeTab === 'binder' ? 'is-active' : ''}`}
            onClick={() => {
              soundEngine.playHover();
              setActiveTab('binder');
            }}
          >
            <BookOpen size={18} />
            <span>Binder</span>
            <small className="bnd-bottom-nav__badge">{collectedCount}/105</small>
          </button>
        </nav>
      )}

      {/* Reset Save Confirmation Modal */}
      {showResetConfirm && (
        <div className="bnd-modal-backdrop" onClick={() => setShowResetConfirm(false)}>
          <div
            className="bnd-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bnd-reset-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="bnd-reset-title">Reset B’n’D Save Data?</h2>
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
