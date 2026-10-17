// Splits a question prompt into its Persian instruction and its English sentence.
// Example: "جمله را سؤالی کن: The students like tea." ->
//   { instruction: "جمله را سؤالی کن", sentence: "The students like tea." }
// A prompt with no English (for example a Persian sentence to translate) gives sentence "".

export function splitPrompt(text) {
  const source = String(text ?? '').trim();
  const start = source.search(/[A-Za-z]/);
  if (start < 0) return { instruction: source, sentence: '' };

  return {
    instruction: source.slice(0, start).replace(/[\s:：]+$/u, '').trim(),
    sentence: source.slice(start).trim(),
  };
}
