import { IBookProvider } from "../types";
import { ProjectGutenbergProvider } from "./ProjectGutenberg";
import { OpenLibraryProvider } from "./OpenLibrary";
import { InternetArchiveProvider } from "./InternetArchive";
import { StandardEbooksProvider } from "./StandardEbooks";
import { ShamelaProvider } from "./Shamela";
import { ArabTranslationProvider } from "./ArabTranslation";
import { GallicaProvider } from "./Gallica";
import { DDBProvider } from "./DDB";
import { CervantesProvider } from "./Cervantes";
import { DOABProvider } from "./DOAB";

export const providers: IBookProvider[] = [
  new ProjectGutenbergProvider(),
  new OpenLibraryProvider(),
  new InternetArchiveProvider(),
  new StandardEbooksProvider(),
  new ShamelaProvider(),
  new ArabTranslationProvider(),
  new GallicaProvider(),
  new DDBProvider(),
  new CervantesProvider(),
  new DOABProvider()
];
