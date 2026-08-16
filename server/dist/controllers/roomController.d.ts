import { Request, Response } from 'express';
export declare const createRoom: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const joinRoom: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
