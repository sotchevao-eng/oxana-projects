import assert from 'node:assert/strict'
import {
  CLIENT_NAME_PLACEHOLDER,
  COMPANY_NAME_PLACEHOLDER,
  applyProposalVariables,
  buildProposalOpenAiUserPrompt,
  containsKnownPii,
  sanitizeBriefAnswersForAi,
  sanitizeProposalInputForAi,
} from './piiSanitizer'

function run() {
  // TEST 1: known client PII must not appear in OpenAI payload serialization
  const client = {
    name: 'Иван Иванов',
    email: 'ivan@example.ru',
    phone: '+79990000000',
    messenger: '@ivan_tg',
    company: 'ООО Ромашка',
  }

  const { safeAnswers, personalFieldsRemovedCount } = sanitizeBriefAnswersForAi(
    [
      {
        field_key: 'project_goal',
        label: 'Цель проекта',
        field_type: 'long_text',
        is_personal_data: false,
      },
      {
        field_key: 'contact_email',
        label: 'Email',
        field_type: 'email',
        is_personal_data: false, // intentionally wrong flag
      },
      {
        field_key: 'full_name',
        label: 'ФИО',
        field_type: 'short_text',
        is_personal_data: true,
      },
    ],
    {
      project_goal: 'Нужен сайт компании',
      contact_email: client.email,
      full_name: 'Петров Пётр',
    },
  )

  // TEST 2: personal answer excluded
  assert.equal(
    safeAnswers.some((item) => item.answer.includes('Петров')),
    false,
  )

  // TEST 3: contact_email excluded by heuristic even if flag false
  assert.equal(
    safeAnswers.some((item) => item.field_key === 'contact_email'),
    false,
  )
  assert.ok(personalFieldsRemovedCount >= 2)

  const safeInput = sanitizeProposalInputForAi({
    project_type: 'Сайт',
    title: 'Сайт для компании',
    description: 'Описание без контактов',
    task: 'Сделать сайт',
    price: '120000',
    deadline: '4 недели',
    comment: 'акцент на скорость',
    proposal_style: 'standard',
    safe_answers: safeAnswers,
  })

  const userPrompt = buildProposalOpenAiUserPrompt(safeInput)
  const openaiPayload = {
    messages: [{ role: 'user', content: userPrompt }],
  }

  // TEST 1 continued
  assert.equal(containsKnownPii(openaiPayload, [
    client.name,
    client.email,
    client.phone,
    client.messenger,
  ]), false)
  assert.equal(JSON.stringify(openaiPayload).includes(client.name), false)
  assert.equal(JSON.stringify(openaiPayload).includes(client.email), false)
  assert.equal(JSON.stringify(openaiPayload).includes(client.phone), false)

  // TEST 4: placeholders present, real name never
  assert.ok(userPrompt.includes(CLIENT_NAME_PLACEHOLDER))
  assert.ok(userPrompt.includes(COMPANY_NAME_PLACEHOLDER))
  assert.equal(userPrompt.includes(client.name), false)

  // TEST 5: local substitution
  const localized = applyProposalVariables(
    `Предложение для ${CLIENT_NAME_PLACEHOLDER} (${COMPANY_NAME_PLACEHOLDER})`,
    { clientName: client.name, companyName: client.company },
  )
  assert.equal(
    localized,
    'Предложение для Иван Иванов (ООО Ромашка)',
  )
  assert.equal(localized.includes(CLIENT_NAME_PLACEHOLDER), false)

  // TEST 6: allowed log shape must not embed PII strings
  const allowedLog = JSON.stringify({
    event: 'generate_proposal_ok',
    project_id: 'proj_demo',
    generation_type: 'proposal',
    count_safe_answers: safeAnswers.length,
    count_filtered_personal_fields: personalFieldsRemovedCount,
  })
  assert.equal(allowedLog.includes(client.email), false)
  assert.equal(allowedLog.includes(client.phone), false)
  assert.equal(allowedLog.includes(client.name), false)

  console.log('piiSanitizer self-tests: OK')
}

run()
