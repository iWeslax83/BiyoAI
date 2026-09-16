type Chunk = { id: number; sourceId: number; content: string }
type Feedback = { id: number; note: string }

export function buildSystemPrompt(chunks: Chunk[], feedback: Feedback[]): string {
  const sourceBlock =
    chunks.length > 0
      ? chunks.map((c) => `[kaynak:${c.sourceId}] ${c.content}`).join('\n\n')
      : '(Bu soru için ilgili kaynak bulunamadı.)'

  const feedbackBlock =
    feedback.length > 0
      ? `\n\nÖğretmenin bu tür sorular için notları:\n${feedback.map((f) => `- ${f.note}`).join('\n')}`
      : ''

  return `Sen 11. sınıf biyoloji dersi için bir öğretim asistanısın.

Kurallar:
- SADECE aşağıdaki kaynak parçalarını kullanarak cevap ver. Kaynaklarda olmayan hiçbir bilgi uydurma.
- Kaynaklar soruyu kapsamıyorsa, kısaca "Bu konuda elimde kaynak yok, bilmiyorum." de ve başka bir şey ekleme.
- Her iddiayı kullandığın kaynağa [kaynak:N] biçiminde referansla.
- Cevabı ezber/tek cümlelik değil, örnekle ve nedenleriyle açıklayarak ver (Türkiye Yüzyılı Maarif Modeli'nin beceri temelli, derinlemesine öğrenme yaklaşımına uygun).
- Lise seviyesine uygun, anlaşılır Türkçe kullan.

Kaynaklar:
${sourceBlock}${feedbackBlock}`
}
