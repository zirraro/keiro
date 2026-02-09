import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';
import { writeFile, unlink, mkdir, readFile, chmod } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { execSync } from 'child_process';

export const runtime = 'nodejs';
export const maxDuration = 60;

const FFMPEG_PATH = join(tmpdir(), 'ffmpeg');

/**
 * Télécharge le binaire FFmpeg dans /tmp s'il n'existe pas déjà.
 * Cached entre les invocations warm de Vercel.
 */
async function ensureFFmpeg(): Promise<string> {
  if (existsSync(FFMPEG_PATH)) {
    console.log('[MergeAV] FFmpeg déjà en cache dans /tmp');
    return FFMPEG_PATH;
  }

  // Essayer d'abord le package npm ffmpeg-static
  try {
    const npmPath = require('ffmpeg-static') as string;
    if (npmPath && existsSync(npmPath)) {
      console.log('[MergeAV] FFmpeg trouvé via ffmpeg-static:', npmPath);
      return npmPath;
    }
  } catch {}

  // Essayer le chemin manuel dans node_modules
  const manualPaths = [
    join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg'),
    '/var/task/node_modules/ffmpeg-static/ffmpeg',
  ];
  for (const p of manualPaths) {
    if (existsSync(p)) {
      console.log('[MergeAV] FFmpeg trouvé manuellement:', p);
      return p;
    }
  }

  // Dernier recours : télécharger le binaire statique dans /tmp
  console.log('[MergeAV] Téléchargement FFmpeg statique...');
  const url = 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.0/linux-x64.gz';

  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Téléchargement FFmpeg échoué: ${res.status}`);

  const gzPath = FFMPEG_PATH + '.gz';
  const buffer = Buffer.from(await res.arrayBuffer());
  await writeFile(gzPath, buffer);

  // Décompresser
  execSync(`gunzip -f ${gzPath}`);
  await chmod(FFMPEG_PATH, '755');

  if (!existsSync(FFMPEG_PATH)) {
    throw new Error('FFmpeg: décompression échouée');
  }

  console.log('[MergeAV] ✅ FFmpeg téléchargé et prêt');
  return FFMPEG_PATH;
}

/**
 * POST /api/merge-audio-video
 * Fusionne un fichier audio dans une vidéo côté serveur via FFmpeg.
 */
export async function POST(req: NextRequest) {
  const id = randomUUID().slice(0, 8);
  const tmpDir = join(tmpdir(), `merge-${id}`);

  try {
    console.log(`[MergeAV-${id}] Starting...`);

    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Non authentifié' }, { status: 401 });
    }

    const { videoUrl, audioUrl } = await req.json();
    if (!videoUrl || !audioUrl) {
      return NextResponse.json({ ok: false, error: 'videoUrl et audioUrl requis' }, { status: 400 });
    }

    // Obtenir FFmpeg
    const ffmpegBin = await ensureFFmpeg();
    console.log(`[MergeAV-${id}] FFmpeg: ${ffmpegBin}`);

    // Créer dossier temp
    await mkdir(tmpDir, { recursive: true });

    const videoPath = join(tmpDir, 'input.mp4');
    const audioPath = join(tmpDir, 'audio.mp3');
    const outputPath = join(tmpDir, 'merged.mp4');

    // Télécharger vidéo et audio en parallèle
    console.log(`[MergeAV-${id}] Téléchargement fichiers...`);
    const [videoRes, audioRes] = await Promise.all([fetch(videoUrl), fetch(audioUrl)]);

    if (!videoRes.ok) throw new Error(`Download vidéo échoué: ${videoRes.status}`);
    if (!audioRes.ok) throw new Error(`Download audio échoué: ${audioRes.status}`);

    const [videoBuffer, audioBuffer] = await Promise.all([
      videoRes.arrayBuffer(),
      audioRes.arrayBuffer()
    ]);

    console.log(`[MergeAV-${id}] Video: ${(videoBuffer.byteLength / 1024 / 1024).toFixed(2)} MB, Audio: ${(audioBuffer.byteLength / 1024).toFixed(0)} KB`);

    await Promise.all([
      writeFile(videoPath, Buffer.from(videoBuffer)),
      writeFile(audioPath, Buffer.from(audioBuffer))
    ]);

    // Fusion FFmpeg (copie vidéo, encode audio AAC)
    console.log(`[MergeAV-${id}] Fusion FFmpeg...`);
    const cmd = `"${ffmpegBin}" -i "${videoPath}" -i "${audioPath}" -c:v copy -c:a aac -b:a 128k -map 0:v:0 -map 1:a:0 -shortest -movflags +faststart -y "${outputPath}"`;
    console.log(`[MergeAV-${id}] CMD: ${cmd}`);

    execSync(cmd, { timeout: 30000 });
    console.log(`[MergeAV-${id}] ✅ Fusion terminée`);

    // Lire le fichier fusionné
    const mergedBuffer = await readFile(outputPath);
    console.log(`[MergeAV-${id}] Fichier fusionné: ${(mergedBuffer.byteLength / 1024 / 1024).toFixed(2)} MB`);

    // Upload vers Supabase Storage
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const fileName = `merged-videos/${user.id}/${Date.now()}.mp4`;

    const { error: uploadError } = await supabase.storage
      .from('generated-images')
      .upload(fileName, mergedBuffer, { contentType: 'video/mp4', upsert: false });

    if (uploadError) throw new Error(`Upload échoué: ${uploadError.message}`);

    const { data: { publicUrl } } = supabase.storage
      .from('generated-images')
      .getPublicUrl(fileName);

    console.log(`[MergeAV-${id}] ✅ Upload Supabase: ${publicUrl}`);

    // Nettoyage
    await Promise.all([
      unlink(videoPath).catch(() => {}),
      unlink(audioPath).catch(() => {}),
      unlink(outputPath).catch(() => {})
    ]);

    return NextResponse.json({ ok: true, mergedUrl: publicUrl, videoSize: mergedBuffer.byteLength });

  } catch (error: any) {
    console.error(`[MergeAV-${id}] ❌ Error:`, error.message);

    await Promise.all([
      unlink(join(tmpDir, 'input.mp4')).catch(() => {}),
      unlink(join(tmpDir, 'audio.mp3')).catch(() => {}),
      unlink(join(tmpDir, 'merged.mp4')).catch(() => {})
    ]);

    return NextResponse.json(
      { ok: false, error: error.message || 'Erreur de fusion audio/vidéo' },
      { status: 500 }
    );
  }
}
