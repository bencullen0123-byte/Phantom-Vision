import { Request, Response, NextFunction } from "express";

export function requireMerchant(req: Request, res: Response, next: NextFunction) {
  const merchantId = req.session?.merchantId;

  if (!merchantId) {
    return res.status(401).json({
      status: "error",
      message: "Unauthorized - no active merchant session",
    });
  }

  req.merchantId = merchantId;
  next();
}

export function optionalMerchant(req: Request, res: Response, next: NextFunction) {
  const merchantId = req.session?.merchantId;
  
  if (merchantId) {
    req.merchantId = merchantId;
  }
  
  next();
}
