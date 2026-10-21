import type { PersonalityResult } from '../types'

const WIDTH = 1080
const HEIGHT = 1350

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, width, height, radius)
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function createShareCard(result: PersonalityResult): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Your browser could not create the share image.')

  ctx.fillStyle = '#0c0b12'
  ctx.fillRect(0, 0, WIDTH, HEIGHT)
  const glow = ctx.createRadialGradient(820, 260, 12, 820, 260, 670)
  glow.addColorStop(0, `${result.primary.color}48`)
  glow.addColorStop(.48, '#52366b20')
  glow.addColorStop(1, '#0c0b1200')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  const lowerGlow = ctx.createRadialGradient(100, 1120, 8, 100, 1120, 580)
  lowerGlow.addColorStop(0, '#ff80791c')
  lowerGlow.addColorStop(1, '#0c0b1200')
  ctx.fillStyle = lowerGlow
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  ctx.strokeStyle = '#c4a8ff24'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.ellipse(920, 300, 280, 170, -.45, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.ellipse(930, 300, 320, 225, .6, 0, Math.PI * 2)
  ctx.stroke()
  ctx.strokeStyle = '#ffffff18'
  ctx.strokeRect(28, 28, WIDTH - 56, HEIGHT - 56)

  ctx.fillStyle = '#d8ff76'
  ctx.font = '700 25px Arial, sans-serif'
  ctx.letterSpacing = '5px'
  ctx.fillText('SOUNDPRINT / YOUR LISTENING DNA', 80, 100)

  ctx.fillStyle = result.primary.color
  ctx.font = '100px Arial, sans-serif'
  ctx.fillText(result.primary.emoji, 78, 260)
  ctx.fillStyle = '#f6f5f1'
  ctx.font = '700 82px Arial, sans-serif'
  ctx.letterSpacing = '-3px'
  ctx.fillText(result.primary.name, 80, 380)
  ctx.fillStyle = '#b9b7c3'
  ctx.font = '36px Arial, sans-serif'
  ctx.letterSpacing = '0px'
  ctx.fillText(result.primary.tagline, 84, 450)

  roundedRect(ctx, 80, 530, 920, 235, 28)
  ctx.fillStyle = '#ffffff0c'
  ctx.fill()
  ctx.strokeStyle = '#ffffff20'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.fillStyle = '#d8ff76'
  ctx.font = '700 21px Arial, sans-serif'
  ctx.letterSpacing = '3px'
  ctx.fillText('THE LISTENING CLUE', 120, 590)
  ctx.fillStyle = '#f6f5f1'
  ctx.font = '32px Arial, sans-serif'
  ctx.letterSpacing = '0px'
  const line = result.explanation.length > 65 ? `${result.explanation.slice(0, 62)}…` : result.explanation
  ctx.fillText(line, 120, 660, 820)
  ctx.fillStyle = '#b9b7c3'
  ctx.font = '24px Arial, sans-serif'
  ctx.fillText(result.topGenres.length ? `IN YOUR ROTATION: ${result.topGenres.join('  ·  ')}` : 'A portrait made from your recent listening', 120, 715, 820)

  ctx.fillStyle = '#b9b7c3'
  ctx.font = '700 20px Arial, sans-serif'
  ctx.letterSpacing = '3px'
  ctx.fillText('YOUR OTHER FREQUENCIES', 84, 870)
  result.scores.slice(1, 4).forEach((item, index) => {
    const y = 940 + index * 92
    ctx.fillStyle = item.color
    ctx.beginPath()
    ctx.arc(100, y - 8, 10, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#f6f5f1'
    ctx.font = '34px Arial, sans-serif'
    ctx.letterSpacing = '0px'
    ctx.fillText(item.name, 130, y)
    ctx.fillStyle = '#b9b7c3'
    ctx.textAlign = 'right'
    ctx.fillText(`${item.score}%`, 990, y)
    ctx.textAlign = 'left'
  })
  ctx.fillStyle = '#d8ff76'
  ctx.font = '700 23px Arial, sans-serif'
  ctx.letterSpacing = '4px'
  ctx.fillText('SOUNDPRINT', 84, 1260)
  ctx.fillStyle = '#898794'
  ctx.font = '22px Arial, sans-serif'
  ctx.letterSpacing = '0px'
  ctx.textAlign = 'right'
  ctx.fillText('Your music, your mirror.', 996, 1260)
  ctx.textAlign = 'left'

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not export the share image.'))), 'image/png'),
  )
}

export async function downloadShareCard(result: PersonalityResult) {
  download(await createShareCard(result), 'soundprint-listening-dna.png')
}

export async function shareResult(result: PersonalityResult) {
  const blob = await createShareCard(result)
  const file = new File([blob], 'soundprint-listening-dna.png', { type: 'image/png' })
  const text = `My Soundprint is ${result.primary.name}. ${result.primary.tagline} Find your listening DNA.`
  if (navigator.canShare?.({ files: [file] }) && navigator.share) {
    await navigator.share({ title: 'My Soundprint', text, files: [file] })
    return
  }
  if (navigator.share) {
    await navigator.share({ title: 'My Soundprint', text })
    return
  }
  await navigator.clipboard.writeText(text)
}
