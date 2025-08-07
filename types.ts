export enum DescriptionLength {
  Short = 'breve',
  Long = 'lunga',
}

export interface Suggestion {
  name: string;
  category: string;
}

export interface PointOfInterest {
  name: string;
  description: string;
  imageUrl: string;
}

export interface GuideContent {
    description: string;
    imageUrl: string;
    subPoints: PointOfInterest[];
}
