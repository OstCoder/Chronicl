import { TOPIC_GROUPS } from '../data/topicGroups'

interface TopicGroupSelectorProps {
  selectedId: string
  onSelect: (id: string) => void
}

/**
 * Five real topic groups — the visible control surface of the live-data
 * validation harness. Selected chip state lives in HomePage (single source
 * of truth), exactly like the category filter.
 */
export default function TopicGroupSelector({ selectedId, onSelect }: TopicGroupSelectorProps) {
  return (
    <div className="topic-groups">
      <p className="topic-groups-label">Live news topic groups</p>
      <div className="topic-group-chips">
        {TOPIC_GROUPS.map((group) => (
          <button
            key={group.id}
            type="button"
            title={group.description}
            className={
              selectedId === group.id ? 'topic-chip topic-chip--active' : 'topic-chip'
            }
            onClick={() => onSelect(group.id)}
          >
            {group.label}
          </button>
        ))}
      </div>
      <p className="topic-groups-hint">
        Each chip runs a real GDELT query (last 7 days). The fictional stories
        below stay as demonstration data for the story-history sections only.
      </p>
    </div>
  )
}
