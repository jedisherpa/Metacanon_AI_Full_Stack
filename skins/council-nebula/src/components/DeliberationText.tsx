type ParsedItem = {
  index: number;
  title?: string;
  body: string;
};

type ParsedBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: ParsedItem[] };

type StructuredCard = {
  title: string;
  body: string;
  bullets: string[];
  endorsers: string[];
  confidence: string;
  quickTest: string;
  risk: string;
};

type StructuredArtifact = {
  format: 'structured_v1';
  artifact: string;
  title: string;
  summary: string;
  cards: StructuredCard[];
  questions: string[];
  rawText: string;
};

function cleanInline(text: string) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map(asString).filter(Boolean);
}

function parseStructured(content: string): StructuredArtifact | null {
  if (!content) return null;
  try {
    const parsed = JSON.parse(content) as any;
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.format !== 'structured_v1') return null;

    const cards: StructuredCard[] = Array.isArray(parsed.cards)
      ? parsed.cards
          .map((card: any) => ({
            title: asString(card?.title),
            body: asString(card?.body),
            bullets: asStringArray(card?.bullets),
            endorsers: asStringArray(card?.endorsers),
            confidence: asString(card?.confidence),
            quickTest: asString(card?.quickTest),
            risk: asString(card?.risk)
          }))
          .filter((card) => card.title || card.body || card.bullets.length > 0)
      : [];

    return {
      format: 'structured_v1',
      artifact: asString(parsed.artifact),
      title: asString(parsed.title),
      summary: asString(parsed.summary),
      cards,
      questions: asStringArray(parsed.questions),
      rawText: asString(parsed.rawText)
    };
  } catch {
    return null;
  }
}

function parseList(lines: string[]) {
  const items: Array<{ index: number; raw: string }> = [];
  let current: { index: number; raw: string } | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    const start = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (start) {
      if (current) {
        items.push(current);
      }
      current = {
        index: Number(start[1]),
        raw: start[2]
      };
      continue;
    }

    if (current) {
      current.raw = `${current.raw} ${trimmed}`.trim();
      continue;
    }

    return null;
  }

  if (current) {
    items.push(current);
  }

  if (items.length === 0) {
    return null;
  }

  return items.map((item) => {
    const bold = item.raw.match(/^\*\*(.+?)\*\*:\s*(.+)$/);
    if (bold) {
      return {
        index: item.index,
        title: cleanInline(bold[1]),
        body: cleanInline(bold[2])
      };
    }

    return {
      index: item.index,
      body: cleanInline(item.raw)
    };
  });
}

function parseContent(content: string): ParsedBlock[] {
  const normalized = content.replace(/\r/g, '');
  const blocks = normalized
    .split(/\n\s*\n/)
    .map((block) => block.split('\n').map((line) => line.trim()).filter(Boolean))
    .filter((lines) => lines.length > 0);

  return blocks.map((lines) => {
    const list = parseList(lines);
    if (list) {
      return { type: 'list', items: list };
    }

    return {
      type: 'paragraph',
      text: cleanInline(lines.join(' '))
    };
  });
}

export default function DeliberationText(props: { content: string }) {
  const structured = parseStructured(props.content || '');
  if (structured) {
    return (
      <div className="artifact-structured">
        {structured.summary ? <p className="artifact-summary">{structured.summary}</p> : null}

        <div className="artifact-structured-grid">
          {structured.cards.map((card, index) => (
            <article key={`${card.title}-${index}`} className="artifact-structured-card">
              <div className="artifact-structured-card__head">
                <strong className="artifact-structured-card__title">{card.title}</strong>
                {card.confidence ? <span className="artifact-meta-pill">{card.confidence}</span> : null}
              </div>

              {card.body ? <p className="artifact-paragraph">{card.body}</p> : null}

              {card.bullets.length > 0 ? (
                <ul className="artifact-bullets">
                  {card.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              ) : null}

              {card.endorsers.length > 0 ? (
                <p className="artifact-meta-line">Endorsers: {card.endorsers.join(', ')}</p>
              ) : null}
              {card.quickTest ? <p className="artifact-meta-line">Quick test: {card.quickTest}</p> : null}
              {card.risk ? <p className="artifact-meta-line">Risk: {card.risk}</p> : null}
            </article>
          ))}
        </div>

        {structured.questions.length > 0 ? (
          <section className="artifact-questions">
            <strong>Questions to explore</strong>
            <ul className="artifact-bullets">
              {structured.questions.map((question) => (
                <li key={question}>{question}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {!structured.summary && structured.cards.length === 0 && structured.rawText ? (
          <p className="artifact-paragraph">{structured.rawText}</p>
        ) : null}
      </div>
    );
  }

  const blocks = parseContent(props.content || '');

  return (
    <div className="artifact-rich">
      {blocks.map((block, blockIndex) => {
        if (block.type === 'paragraph') {
          return (
            <p key={`paragraph-${blockIndex}`} className="artifact-paragraph">
              {block.text}
            </p>
          );
        }

        return (
          <div key={`list-${blockIndex}`} className="artifact-list">
            {block.items.map((item) => (
              <div key={`${blockIndex}-${item.index}`} className="artifact-item">
                <div className="artifact-item__head">
                  <span className="artifact-item__index">{item.index}</span>
                  {item.title ? <strong className="artifact-item__title">{item.title}</strong> : null}
                </div>
                <p className="artifact-item__body">{item.body}</p>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
