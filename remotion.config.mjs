// Configuration Remotion (studio + rendu). N'affecte PAS le build Vite de l'app :
// Remotion utilise son propre bundler webpack interne.
import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
// H.264 lisible partout (Facebook, WhatsApp, YouTube).
Config.setCodec('h264');
