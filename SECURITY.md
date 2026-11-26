# Sécurité

Si tu découvres une faille de sécurité, merci de **ne pas ouvrir de ticket public**.
Écris à l'adresse indiquée dans la variable `CONTACT_EMAIL` de l'instance concernée,
ou au mainteneur du dépôt, avec une description et les étapes pour reproduire le problème.
Nous répondons sous 72 heures.

Mesures en place :

- mots de passe hachés avec Argon2, sessions signées dans un cookie `HttpOnly` / `SameSite=Lax` ;
- protection CSRF par en-tête dédié sur toutes les écritures ;
- limitation du débit sur la connexion, les e-mails, l'IA et les dons ;
- liens de réinitialisation à usage unique, valables 2 heures ;
- contenu des offres traité comme une donnée, jamais comme une instruction, dans les appels aux modèles ;
- plafond quotidien de dépenses d'IA, global et par utilisateur ;
- aucune donnée personnelle dans le journal public de l'agent.
