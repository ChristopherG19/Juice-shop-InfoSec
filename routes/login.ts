/*
 * Copyright (c) 2014-2024 Bjoern Kimminich & the OWASP Juice Shop contributors.
 * SPDX-License-Identifier: MIT
 */

import models = require('../models/index')
import { type Request, type Response, type NextFunction } from 'express'
import { type User } from '../data/types'
import { BasketModel } from '../models/basket'
import { UserModel } from '../models/user'
import challengeUtils = require('../lib/challengeUtils')
import config from 'config'
import { challenges } from '../data/datacache'
import logEvent from '../lib/loggerES'

import * as utils from '../lib/utils'
const security = require('../lib/insecurity')
const users = require('../data/datacache').users

// vuln-code-snippet start loginAdminChallenge loginBenderChallenge loginJimChallenge
module.exports = function login () {
  function afterLogin (user: { data: User, bid: number }, res: Response, next: NextFunction) {
    verifyPostLoginChallenges(user) // vuln-code-snippet hide-line
    BasketModel.findOrCreate({ where: { UserId: user.data.id } })
      .then(([basket]: [BasketModel, boolean]) => {
        const token = security.authorize(user)
        user.bid = basket.id // keep track of original basket
        security.authenticatedUsers.put(token, user)
        res.json({ authentication: { token, bid: basket.id, umail: user.data.email } })
      }).catch((error: Error) => {
        next(error)
      })
  }

  function containsKeywords (input: any, keywords: any) {
    // Convertimos el input en una cadena de texto segura para evitar errores con caracteres especiales
    const safeInput = input.toString().toLowerCase()

    // Verificar si el input contiene alguna de las palabras clave sospechosas
    return keywords.some((keyword: any) => safeInput.match(new RegExp(keyword, 'i')))
  }

  return async (req: Request, res: Response, next: NextFunction) => {
    const username = req.body.email || ''
    const password = req.body.password || ''
    const sqlInjectionKeywords = [
      '--', ';', 'xp_', 'or 1=1', 'select *', 'union select', '--', 'drop table', 'insert into',
      'update', 'select', 'delete', 'exec', 'char', 'concat'
    ]
    const xssKeywords = [
      '<', '>', 'javascript:', 'alert(', 'onerror=', 'iframe', 'script', 'eval(', 'document.cookie'
    ]
    // Verificar SQL Injection
    if (containsKeywords(username, sqlInjectionKeywords) || containsKeywords(password, sqlInjectionKeywords)) {
      await logEvent('sql_injection_attempt', {
        message: 'Intento de SQL Injection detectado',
        input: { username, password },
        status: 'vuln'
      })
      return res.status(400).json({ error: 'Invalid input detected (SQL Injection)' })
    }

    // Verificar XSS
    if (containsKeywords(username, xssKeywords) || containsKeywords(password, xssKeywords)) {
      await logEvent('xss_attempt', {
        message: 'Intento de XSS detectado',
        input: { username, password },
        status: 'vuln'
      })
      return res.status(400).json({ error: 'Invalid input detected (XSS)' })
    }

    verifyPreLoginChallenges(req) // vuln-code-snippet hide-line
    models.sequelize.query(
      `SELECT * FROM Users WHERE email = '${username}' AND password = '${security.hash(password)}' AND deletedAt IS NULL`,
      { model: UserModel, plain: true }
    ) // vuln-code-snippet vuln-line loginAdminChallenge loginBenderChallenge loginJimChallenge
      .then(async (authenticatedUser) => { // vuln-code-snippet neutral-line loginAdminChallenge loginBenderChallenge loginJimChallenge
        const user = utils.queryResultToJson(authenticatedUser)
        if (user.data?.id && user.data.totpSecret !== '') {
          await logEvent('login_attempt', { username, password, status: 'totp_required' })
          res.status(401).json({
            status: 'totp_token_required',
            data: {
              tmpToken: security.authorize({
                userId: user.data.id,
                type: 'password_valid_needs_second_factor_token'
              })
            }
          })
        } else if (user.data?.id) {
          await logEvent('login_attempt', { username, password, status: 'success' })
          // @ts-expect-error FIXME some properties missing in user - vuln-code-snippet hide-line
          afterLogin(user, res, next)
        } else {
          await logEvent('login_attempt', { username, password, status: 'failure' })
          res.status(401).send(res.__('Invalid email or password.'))
        }
      }).catch(async (error: Error) => {
        await logEvent('login_attempt', { username, password, status: 'error', error: error.message })
        next(error)
      })
  }
  // vuln-code-snippet end loginAdminChallenge loginBenderChallenge loginJimChallenge

  function verifyPreLoginChallenges (req: Request) {
    challengeUtils.solveIf(challenges.weakPasswordChallenge, () => { return req.body.email === 'admin@' + config.get<string>('application.domain') && req.body.password === 'admin123' })
    challengeUtils.solveIf(challenges.loginSupportChallenge, () => { return req.body.email === 'support@' + config.get<string>('application.domain') && req.body.password === 'J6aVjTgOpRs@?5l!Zkq2AYnCE@RF$P' })
    challengeUtils.solveIf(challenges.loginRapperChallenge, () => { return req.body.email === 'mc.safesearch@' + config.get<string>('application.domain') && req.body.password === 'Mr. N00dles' })
    challengeUtils.solveIf(challenges.loginAmyChallenge, () => { return req.body.email === 'amy@' + config.get<string>('application.domain') && req.body.password === 'K1f.....................' })
    challengeUtils.solveIf(challenges.dlpPasswordSprayingChallenge, () => { return req.body.email === 'J12934@' + config.get<string>('application.domain') && req.body.password === '0Y8rMnww$*9VFYE§59-!Fg1L6t&6lB' })
    challengeUtils.solveIf(challenges.oauthUserPasswordChallenge, () => { return req.body.email === 'bjoern.kimminich@gmail.com' && req.body.password === 'bW9jLmxpYW1nQGhjaW5pbW1pay5ucmVvamI=' })
  }

  function verifyPostLoginChallenges (user: { data: User }) {
    challengeUtils.solveIf(challenges.loginAdminChallenge, () => { return user.data.id === users.admin.id })
    challengeUtils.solveIf(challenges.loginJimChallenge, () => { return user.data.id === users.jim.id })
    challengeUtils.solveIf(challenges.loginBenderChallenge, () => { return user.data.id === users.bender.id })
    challengeUtils.solveIf(challenges.ghostLoginChallenge, () => { return user.data.id === users.chris.id })
    if (challengeUtils.notSolved(challenges.ephemeralAccountantChallenge) && user.data.email === 'acc0unt4nt@' + config.get<string>('application.domain') && user.data.role === 'accounting') {
      UserModel.count({ where: { email: 'acc0unt4nt@' + config.get<string>('application.domain') } }).then((count: number) => {
        if (count === 0) {
          challengeUtils.solve(challenges.ephemeralAccountantChallenge)
        }
      }).catch(() => {
        throw new Error('Unable to verify challenges! Try again')
      })
    }
  }
}
