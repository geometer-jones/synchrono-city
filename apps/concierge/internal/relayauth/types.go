package relayauth

type Request struct {
	Action string `json:"action"`
	Scope  string `json:"scope"`
	Pubkey string `json:"pubkey"`
	Event  Event  `json:"event"`
}

type Event struct {
	ID        string     `json:"id"`
	Kind      int        `json:"kind"`
	CreatedAt int64      `json:"created_at"`
	Tags      [][]string `json:"tags"`
}

type Response struct {
	Allow        bool         `json:"allow"`
	Reason       string       `json:"reason"`
	Scope        string       `json:"scope"`
	Capabilities Capabilities `json:"capabilities"`
	Policy       Policy       `json:"policy"`
}

type Capabilities struct {
	CanModerate bool `json:"can_moderate"`
}

type Policy struct {
	Publish PublishPolicy `json:"publish"`
}

type PublishPolicy struct {
	Allowed             bool       `json:"allowed"`
	Reason              string     `json:"reason"`
	Mode                string     `json:"mode"`
	ProofRequirement    string     `json:"proof_requirement"`
	ProofRequirementMet bool       `json:"proof_requirement_met"`
	Gates               []GateInfo `json:"gates"`
}

type GateInfo struct {
	Type   string `json:"type"`
	Status string `json:"status"`
}
