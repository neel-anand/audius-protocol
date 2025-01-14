import type { CustomRequest } from '../../utils'
import type Logger from 'bunyan'
import {
  sendResponse,
  errorResponseServerError,
  errorResponseForbidden,
  errorResponseUnauthorized,
  errorResponseBadRequest
} from '../../apiHelpers'
import { NextFunction, Request, Response } from 'express'
import { checkCIDAccess } from '../../contentAccess/contentAccessChecker'
import { tracing } from '../../tracer'

/**
 * Middleware to validate requests to get content.
 * For streaming, CN gets a DN signature:
 * - generated by a DN with the cid along with a timestamp,
 * This middleware will recover the DN signature and verify that it is from a registered DN.
 * It will then check if a cid / track is blacklisted.
 * It also verifies that cid is same as those in the DN-signed data, and also verify that DN-signed data
 * timestamp is relatively recent.
 * If all these verifications are successful, then this middleware will proceed with the request as normal.
 */
export const contentAccessMiddleware = async (
  request: Request,
  res: Response,
  next: NextFunction
) => {
  const req = request as CustomRequest
  const cid = req.params?.CID
  if (!cid) {
    return sendResponse(
      req,
      res,
      errorResponseBadRequest(`Invalid request, no CID provided.`)
    )
  }

  try {
    const { data, signature, error: parseError } = parseQueryParams(req.query)

    if (parseError) {
      sendResponse(
        req,
        res,
        errorResponseUnauthorized('Invalid query parameter for content.')
      )
    }

    const serviceRegistry = req.app.get('serviceRegistry')
    const { libs, redis } = serviceRegistry
    const logger = req.logger as Logger

    const cidAccess = await checkCIDAccess({
      cid,
      data,
      signature,
      libs,
      logger,
      redis
    })
    const { isValidRequest, shouldCache, error } = cidAccess
    if (!isValidRequest) {
      switch (error) {
        case 'InvalidDiscoveryNode':
          return sendResponse(
            req,
            res,
            errorResponseForbidden(
              'Failed discovery node signature validation for content.'
            )
          )
        case 'IncorrectCID':
          return sendResponse(
            req,
            res,
            errorResponseForbidden('Incorrect CID signature')
          )
        case 'UnservableTrack':
          return sendResponse(
            req,
            res,
            errorResponseForbidden('Track cannot be served by this node')
          )
        case 'ExpiredTimestamp':
          return sendResponse(
            req,
            res,
            errorResponseForbidden(
              'Timestamp for content is expired but track is servable'
            )
          )
        default:
          return sendResponse(
            req,
            res,
            errorResponseForbidden('Failed match verification for content.')
          )
      }
    }

    // We need the info because if the content is gated, then we need to set
    // the cache-control response header to no-cache so that nginx does not cache it.
    ;(req as any).shouldCache = shouldCache
    // Set the trackId as the next middleware will need to check against the blacklist.
    ;(req as any).trackId = cidAccess.trackId
    
    ;(req as any).userId = data.userId

    return next()
  } catch (e: any) {
    tracing.recordException(e)
    const error = `Could not validate content access: ${e.message}`
    req.logger.error(`${error}.\nError: ${JSON.stringify(e, null, 2)}`)
    return sendResponse(req, res, errorResponseServerError(error))
  }
}

const parseQueryParams = (params: any) => {
  try {
    const encodedSignature = params.signature
    const decodedSignature = decodeURIComponent(encodedSignature)
    const { data: dataStr, signature } = JSON.parse(decodedSignature)
    const data = JSON.parse(dataStr)

    return {
      signature,
      data,
      error: false
    }
  } catch (e: any) {
    return {
      signature: null,
      data: null,
      error: true
    }
  }
}
