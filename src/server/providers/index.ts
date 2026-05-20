import { IBookProvider } from "../types";
import { ProjectGutenbergProvider } from "./ProjectGutenberg";
import { OpenLibraryProvider } from "./OpenLibrary";
import { InternetArchiveProvider } from "./InternetArchive";
import { StandardEbooksProvider } from "./StandardEbooks";

export const providers: IBookProvider[] = [
  new ProjectGutenbergProvider(),
  new OpenLibraryProvider(),
  new InternetArchiveProvider(),
  new StandardEbooksProvider()
];
